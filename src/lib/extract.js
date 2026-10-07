// Read the references of a library through the Zotero API.
//
// This is the counterpart of extract.py: the same fields, the same filters
// (no notes, attachments or annotations, nothing in the trash, nothing without
// a title), the same order (oldest addition first). `Zotero` is passed in so
// that the function can be tested with a stand-in.

const TAG_RE = /<[^>]+>/g;
const SPACE_RE = /\s+/g;
const YEAR_RE = /(1[0-9]{3}|20[0-9]{2})/;

export function clean(value) {
  if (!value) return "";
  return String(value).replace(TAG_RE, " ").replace(SPACE_RE, " ").trim();
}

/** The text that represents an item for thematic analysis. */
export function itemText(item) {
  if (!item.abstract) return item.title;
  return `${item.title}. ${item.abstract}`.replace(/^[ .]+|[ .]+$/g, "");
}

/** The personal library and the group libraries (feeds are left out). */
export async function listLibraries(Zotero) {
  const libraries = [];
  for (const lib of Zotero.Libraries.getAll()) {
    if (lib.libraryType !== "user" && lib.libraryType !== "group") continue;
    const ids = await Zotero.Items.getAll(lib.libraryID, true, false, true);
    libraries.push({
      id: lib.libraryID,
      kind: lib.libraryType,
      name: lib.name,
      groupID: lib.libraryType === "group" ? lib.groupID : null,
      nItems: ids.length, // top-level items, notes included: an upper bound shown in the picker
    });
  }
  libraries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "user" ? -1 : 1));
  return libraries;
}

/** Map each collection of a library to its full path, e.g. "Thèse / Sources / Presse". */
export function collectionPaths(Zotero, libraryID) {
  const collections = Zotero.Collections.getByLibrary(libraryID, true);
  const byID = new Map(collections.map((c) => [c.id, c]));
  const paths = new Map();
  for (const c of collections) {
    const parts = [];
    const seen = new Set();
    let cursor = c;
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      parts.push(cursor.name);
      cursor = cursor.parentID ? byID.get(cursor.parentID) : null;
    }
    paths.set(c.id, parts.reverse().join(" / "));
  }
  return paths;
}

function field(item, name, unformatted = false) {
  try {
    return item.getField(name, unformatted, true) || "";
  } catch {
    return "";
  }
}

/**
 * All bibliographic references of a library, oldest addition first.
 *
 * Each reference carries the fields the analysis and the page need:
 * id, key, itemType, dateAdded (ISO 8601, UTC), title, abstract, year, doi,
 * creators (a display string), tags and collections (full paths).
 */
export async function loadItems(Zotero, libraryID, { onProgress } = {}) {
  const library = Zotero.Libraries.get(libraryID);
  const all = await Zotero.Items.getAll(libraryID, true, false);
  const regular = all.filter((it) => it.isRegularItem());
  onProgress?.(0, regular.length);
  await Zotero.Items.loadDataTypes(regular, ["itemData", "creators", "tags", "collections"]);
  const paths = collectionPaths(Zotero, libraryID);

  const items = [];
  for (const it of regular) {
    const title = clean(field(it, "title"));
    if (!title) continue; // nothing to analyse
    const year = YEAR_RE.exec(field(it, "date", true));
    const names = it
      .getCreators()
      .map((c) => c.lastName || c.firstName || "")
      .filter(Boolean);
    items.push({
      id: it.id,
      key: it.key,
      itemType: it.itemType,
      dateAdded: it.dateAdded.replace(" ", "T") + "Z",
      title,
      abstract: clean(field(it, "abstractNote")),
      year: year ? Number(year[1]) : null,
      language: field(it, "language").trim(),
      doi: field(it, "DOI").trim(),
      creators: names.slice(0, 3).join(", ") + (names.length > 3 ? " et al." : ""),
      tags: it.getTags().map((t) => t.tag).sort(),
      collections: it.getCollections().map((id) => paths.get(id)).filter(Boolean).sort(),
    });
  }
  items.sort((a, b) => (a.dateAdded < b.dateAdded ? -1 : a.dateAdded > b.dateAdded ? 1 : a.id - b.id));
  onProgress?.(items.length, items.length);
  return {
    library: {
      id: library.libraryID,
      kind: library.libraryType,
      name: library.name,
      groupID: library.libraryType === "group" ? library.groupID : null,
    },
    items,
  };
}

/** A link that opens the item in the Zotero desktop application. */
export function selectLink(library, key) {
  const scope = library.kind === "user" ? "library" : `groups/${library.groupID}`;
  return `zotero://select/${scope}/items/${key}`;
}
