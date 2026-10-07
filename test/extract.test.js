// Extraction through the Zotero API, against a stand-in for Zotero.
import { test } from "node:test";
import assert from "node:assert/strict";

import { collectionFamily, listCollections, listLibraries, loadItems } from "../src/lib/extract.js";

function fakeItem({ id, key, libraryID = 1, type = "book", added, regular = true, fields = {}, creators = [], tags = [], collections = [] }) {
  return {
    id, key, libraryID, itemType: type, dateAdded: added,
    isRegularItem: () => regular,
    getField: (name) => fields[name] || "",
    getCreators: () => creators,
    getTags: () => tags.map((tag) => ({ tag, type: 0 })),
    getCollections: () => collections,
  };
}

function fakeZotero() {
  const libraries = [
    { libraryID: 1, libraryType: "user", name: "Ma bibliothèque" },
    { libraryID: 2, libraryType: "group", name: "Séminaire", groupID: 77 },
    { libraryID: 3, libraryType: "feed", name: "Un flux" },
  ];
  const collections = [
    { id: 1, key: "C1", name: "Thèse", parentID: null, libraryID: 1 },
    { id: 2, key: "C2", name: "Sources", parentID: 1, libraryID: 1 },
    { id: 3, key: "C3", name: "Cours", parentID: null, libraryID: 1 },
    { id: 4, key: "C4", name: "Presse", parentID: 2, libraryID: 1 },
  ];
  const items = [
    fakeItem({
      id: 1, key: "BOOK0001", added: "2010-03-02 10:00:00",
      fields: { title: "La Banque de France", abstractNote: "<p>Un résumé  avec <i>balises</i>.</p>", date: "1936-00-00 1936", DOI: "10.1000/banque" },
      creators: [{ lastName: "Schacht", firstName: "Hjalmar" }, { lastName: "Moreau", firstName: "Émile" }],
      tags: ["monnaie"], collections: [4],
    }),
    fakeItem({ id: 2, key: "BOOK0002", added: "2008-06-05 09:10:49", fields: { title: "Schacht" }, collections: [3] }),
    fakeItem({ id: 3, key: "NOTE0001", added: "2010-03-02 10:05:00", type: "note", regular: false }),
    fakeItem({ id: 4, key: "UNTITLED", added: "2012-02-01 00:00:00", fields: {} }),
    fakeItem({ id: 5, key: "CASE0001", added: "2012-01-01 00:00:00", type: "case", fields: { title: "Arrêt Costa" }, collections: [1] }),
    fakeItem({ id: 6, key: "GROUP001", libraryID: 2, added: "2013-01-01 00:00:00", fields: { title: "Livre du groupe" } }),
  ];
  const loaded = [];
  return {
    loaded,
    Libraries: { getAll: () => libraries, get: (id) => libraries.find((l) => l.libraryID === id) },
    Items: {
      getAll: async (libraryID, onlyTopLevel, includeDeleted, asIDs = false) => {
        const list = items.filter((it) => it.libraryID === libraryID);
        return asIDs ? list.map((it) => it.id) : list;
      },
      loadDataTypes: async (objects, types) => {
        loaded.push([objects.length, types]);
      },
    },
    Collections: {
      getByLibrary: (libraryID) => collections.filter((c) => c.libraryID === libraryID),
      get: (id) => collections.find((c) => c.id === id),
    },
  };
}

test("libraries exclude feeds and count top-level items", async () => {
  const libraries = await listLibraries(fakeZotero());
  assert.deepEqual(libraries.map((l) => [l.kind, l.name, l.nItems, l.groupID]), [
    ["user", "Ma bibliothèque", 5, null],
    ["group", "Séminaire", 1, 77],
  ]);
});

test("collections are listed with their path and depth, and a family includes descendants", () => {
  const Zotero = fakeZotero();
  const list = listCollections(Zotero, 1);
  assert.deepEqual(list.map((c) => [c.path, c.depth, c.key]), [
    ["Cours", 0, "C3"],
    ["Thèse", 0, "C1"],
    ["Thèse / Sources", 1, "C2"],
    ["Thèse / Sources / Presse", 2, "C4"],
  ]);
  assert.deepEqual([...collectionFamily(Zotero, 1, 1)].sort(), [1, 2, 4]);
  assert.deepEqual([...collectionFamily(Zotero, 1, 3)], [3]);
});

test("items are references with a title, in order of addition, with their fields", async () => {
  const Zotero = fakeZotero();
  const { library, collection, items } = await loadItems(Zotero, 1);
  // Notes and untitled items are left out.
  assert.deepEqual(items.map((it) => it.key), ["BOOK0002", "BOOK0001", "CASE0001"]);
  assert.equal(collection, null);
  assert.deepEqual(library, { id: 1, kind: "user", name: "Ma bibliothèque", groupID: null });
  const book = items[1];
  assert.equal(book.title, "La Banque de France");
  assert.equal(book.abstract, "Un résumé avec balises .");
  assert.equal(book.year, 1936);
  assert.equal(book.dateAdded, "2010-03-02T10:00:00Z");
  assert.equal(book.creators, "Schacht, Moreau");
  assert.deepEqual(book.tags, ["monnaie"]);
  assert.deepEqual(book.collections, ["Thèse / Sources / Presse"]);
  assert.equal(book.doi, "10.1000/banque");
  assert.deepEqual(Zotero.loaded, [[4, ["itemData", "creators", "tags", "collections"]]]); // the note is never loaded
});

test("a collection restricts the references to itself and its sub-collections", async () => {
  const Zotero = fakeZotero();
  const these = await loadItems(Zotero, 1, { collectionID: 1 });
  assert.deepEqual(these.items.map((it) => it.key), ["BOOK0001", "CASE0001"]);
  assert.deepEqual(these.collection, { id: 1, key: "C1", name: "Thèse", path: "Thèse" });
  // Only the members are loaded in full.
  assert.deepEqual(Zotero.loaded, [[4, ["collections"]], [2, ["itemData", "creators", "tags", "collections"]]]);
  const cours = await loadItems(Zotero, 1, { collectionID: 3 });
  assert.deepEqual(cours.items.map((it) => it.key), ["BOOK0002"]);
  await assert.rejects(loadItems(Zotero, 1, { collectionID: 99 }), /not found/);
});

test("a group library is read like the personal one", async () => {
  const { library, items } = await loadItems(fakeZotero(), 2);
  assert.deepEqual(items.map((it) => it.key), ["GROUP001"]);
  assert.deepEqual(library, { id: 2, kind: "group", name: "Séminaire", groupID: 77 });
});
