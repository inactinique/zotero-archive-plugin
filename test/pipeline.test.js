// What goes into the private page and into the page meant for the web.
import { test } from "node:test";
import assert from "node:assert/strict";

import { bulkDays, defaultOptions, excludeCollections, labelKey, payload, publicLink, timestamps } from "../src/lib/pipeline.js";
import { selectLink, itemText } from "../src/lib/extract.js";
import { makeGroup } from "../src/lib/themes.js";

const item = (fields = {}) => ({
  id: 1, key: "ABCD1234", itemType: "book", dateAdded: "2012-03-01T10:00:00Z", title: "Un titre",
  abstract: "", year: null, language: "", doi: "", creators: "", tags: [], collections: [], ...fields,
});

test("public link is built from the DOI only", () => {
  assert.equal(publicLink(item({ doi: "10.1000/a b" })), "https://doi.org/10.1000/a%20b");
  assert.equal(publicLink(item({ doi: "https://doi.org/10.1000/xyz" })), "https://doi.org/10.1000/xyz");
  assert.equal(publicLink(item({ doi: "doi: 10.1000/xyz" })), "https://doi.org/10.1000/xyz");
  assert.equal(publicLink(item({ doi: "javascript:alert(1)" })), "");
  assert.equal(publicLink(item()), "");
});

test("item text, timestamps, bulk days and exclusions", () => {
  assert.equal(itemText(item({ abstract: "Un résumé." })), "Un titre. Un résumé");
  assert.equal(itemText(item()), "Un titre");
  assert.equal(timestamps([item()])[0], Date.UTC(2012, 2, 1, 10) / 1000);
  const items = [item(), item({ id: 2, dateAdded: "2012-03-01T11:00:00Z" }), item({ id: 3, dateAdded: "2012-03-02T11:00:00Z" })];
  assert.deepEqual(bulkDays(items, 2), [["2012-03-01", 2]]);
  const mixed = [item({ collections: ["Thèse / Sources"] }), item({ id: 2, collections: ["Cours"] })];
  assert.equal(excludeCollections(mixed, ["sources"]).length, 1);
  assert.equal(excludeCollections(mixed, []).length, 2);
});

function build({ web = false, webReferences = false, ...options } = {}) {
  const items = [
    item({ creators: "Schacht", year: 1936, doi: "10.1000/xyz", collections: ["Thèse"] }),
    item({ id: 2, key: "EFGH5678", dateAdded: "2012-03-01T11:00:00Z", title: "Sans lien" }),
  ];
  const groupFields = { size: 2, keywords: ["monnaie"], exemplars: [0], collections: [["Thèse", 2]], tags: [] };
  const themes = [makeGroup({ id: 0, children: [0], ...groupFields })];
  const subthemes = [makeGroup({ id: 0, parent: 0, ...groupFields })];
  const labels = new Map([
    [labelKey("theme", 0), { text: "Monnaie", auto: "Monnaie", source: "ollama:test", language: "" }],
    [labelKey("sub", 0), { text: "Banques centrales", auto: "monnaie", source: "keywords", language: "" }],
  ]);
  const library = { id: 1, kind: "user", name: "Ma bibliothèque", groupID: null };
  return payload({
    library, items, sub: [0, 0], themes, subthemes, labels,
    options: defaultOptions({ bulkThreshold: 2, ...options }),
    web, webReferences, linkPrefix: selectLink(library, ""), generated: new Date("2026-10-07T12:00:00Z"),
  });
}

test("private page opens references in Zotero", () => {
  const data = build();
  assert.equal(data.linkPrefix, "zotero://select/library/items/");
  assert.deepEqual([data.themes[0].label, data.subthemes[0].label], ["Monnaie", "Banques centrales"]);
  assert.equal(data.labelModel, "test");
  assert.deepEqual(data.items[0].slice(0, 4), ["ABCD1234", "Un titre", "Schacht", 1936]);
  assert.deepEqual(data.themes[0].collections, [["Thèse", 2]]);
  assert.deepEqual(data.bulkDays, [["2012-03-01", 2]]);
  assert.equal(data.generated, "2026-10-07");
  assert.equal(data.typeLabels.book, "livre");
  assert.equal(build({ language: "en" }).typeLabels.book, "book");
});

test("web page keeps only what the charts need by default", () => {
  const data = build({ web: true, name: "Bibliothèque de test" });
  assert.equal(data.library, "Bibliothèque de test");
  assert.ok(data.web && !data.references && data.linkPrefix === "");
  // Date, sub-theme and bulk flag: no title, author, key or link.
  assert.deepEqual(data.items, [["", "", "", null, 0, "2012-03-01", 0, 1], ["", "", "", null, 0, "2012-03-01", 0, 1]]);
  assert.deepEqual(data.themes[0].collections, []);
  assert.deepEqual(data.subthemes[0].collections, []);
  const text = JSON.stringify(data);
  assert.ok(!text.includes("ABCD1234") && !text.includes("Thèse") && !text.includes("zotero://"));
});

test("web page can list references with public links", () => {
  const data = build({ web: true, webReferences: true });
  assert.ok(data.references);
  assert.deepEqual(data.items[0], ["", "Un titre", "Schacht", 1936, 0, "2012-03-01", 0, 1, "https://doi.org/10.1000/xyz"]);
  assert.equal(data.items[1].at(-1), ""); // no DOI: the title is shown without a link
  const text = JSON.stringify(data);
  assert.ok(!text.includes("ABCD1234") && !text.includes("Thèse") && !text.includes("zotero://"));
});

test("select links point to the personal or the group library", () => {
  assert.equal(selectLink({ kind: "user" }, "ABC"), "zotero://select/library/items/ABC");
  assert.equal(selectLink({ kind: "group", groupID: 77 }, "ABC"), "zotero://select/groups/77/items/ABC");
});
