// The page renders from a payload, in a browser-like document (jsdom).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

import { defaultOptions, labelKey, payload } from "../src/lib/pipeline.js";
import { selectLink } from "../src/lib/extract.js";
import { makeGroup } from "../src/lib/themes.js";
import { renderArchive } from "../src/page/page.js";

const MARKUP = readFileSync(new URL("../src/content/page.html", import.meta.url), "utf8");

function sample() {
  const items = [];
  let n = 0;
  for (const year of [2010, 2011, 2012]) {
    for (let i = 0; i < 4; i++) {
      n++;
      items.push({
        id: n, key: `KEY${n}`, itemType: i % 2 ? "book" : "journalArticle",
        dateAdded: `${year}-0${1 + i}-15T10:00:00Z`, title: `Titre ${n}`, abstract: "",
        year, language: "", doi: i === 0 ? `10.1000/${n}` : "", creators: "Auteur", tags: [], collections: ["Thèse"],
      });
    }
  }
  const sub = items.map((_, i) => (i < 6 ? 0 : 1));
  const g = (id, keywords, fields) => makeGroup({ id, keywords, size: 6, exemplars: [0], collections: [["Thèse", 6]], ...fields });
  const themes = [g(0, ["banque", "monnaie"], { children: [0] }), g(1, ["twitter", "web"], { children: [1] })];
  const subthemes = [g(0, ["reichsbank"], { parent: 0 }), g(1, ["tweets"], { parent: 1 })];
  const labels = new Map([
    [labelKey("theme", 0), { text: "Monnaie", auto: "Monnaie", source: "ollama:m", language: "fr" }],
    [labelKey("theme", 1), { text: "Réseaux", auto: "Réseaux", source: "ollama:m", language: "fr" }],
    [labelKey("sub", 0), { text: "Reichsbank", auto: "reichsbank", source: "keywords", language: "" }],
    [labelKey("sub", 1), { text: "Tweets", auto: "tweets", source: "keywords", language: "" }],
  ]);
  const library = { id: 1, kind: "user", name: "Ma bibliothèque", groupID: null };
  return { library, items, sub, themes, subthemes, labels };
}

function mount(data, options = {}) {
  const dom = new JSDOM(`<!doctype html><html><body><main>${MARKUP}</main></body></html>`, { pretendToBeVisual: true });
  const { window } = dom;
  // The page reads a few globals of the browser it runs in.
  for (const name of ["document", "window", "Node", "HTMLElement", "innerWidth", "innerHeight", "Intl"]) {
    globalThis[name] = name === "Intl" ? Intl : window[name];
  }
  const root = window.document.querySelector(".zotero-archive");
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
  const view = renderArchive(root, data, options);
  return { window, root, view };
}

test("the private page renders themes, periods and references", () => {
  const s = sample();
  const data = payload({ ...s, options: defaultOptions({ bulkThreshold: 100, language: "fr" }), linkPrefix: selectLink(s.library, "") });
  const opened = [];
  const { window, root, view } = mount(data, { onOpen: (key) => opened.push(key) });

  assert.equal(window.document.title, "Zotero comme archive – Ma bibliothèque");
  assert.equal(root.querySelectorAll("#za-legend .rowlabel").length, 2);
  assert.ok(root.querySelector("#za-lede").textContent.includes("12 références ajoutées"));
  // One column per year, one row per theme in the table.
  assert.deepEqual([...root.querySelectorAll("#za-table thead th")].map((th) => th.textContent), ["Thème", "2010", "2011", "2012", "Ensemble"]);
  assert.equal(root.querySelectorAll("#za-table tbody tr").length, 3);
  // Clicking a theme lists its references, whose titles hand the key to the host.
  root.querySelector("#za-legend .rowlabel").dispatchEvent(new window.Event("click"));
  const refs = root.querySelectorAll("#za-refs li a");
  assert.equal(refs.length, 6);
  refs[0].dispatchEvent(new window.Event("click", { cancelable: true }));
  assert.deepEqual(opened, ["KEY1"]);
  assert.ok(root.querySelector("#za-info").textContent.includes("Thèse (6)"));
  view.destroy();
});

test("the web page lists no reference and the English page is in English", () => {
  const s = sample();
  const web = payload({ ...s, options: defaultOptions({ bulkThreshold: 100, language: "en" }), web: true });
  const { root } = mount(web);
  assert.equal(root.querySelector("h1").textContent, "Zotero as an archive");
  assert.equal(root.querySelector("#za-refs-title").textContent, "Selection");
  root.querySelector("#za-legend .rowlabel").dispatchEvent(new globalThis.window.Event("click"));
  assert.equal(root.querySelectorAll("#za-refs li a").length, 0);
  assert.ok(root.querySelector("#za-count").textContent.startsWith("6 references"));
  assert.ok(!root.querySelector("#za-method").textContent.includes("themes.json"));

  const withRefs = payload({ ...s, options: defaultOptions({ bulkThreshold: 100, language: "en" }), web: true, webReferences: true });
  const page = mount(withRefs);
  page.root.querySelector("#za-legend .rowlabel").dispatchEvent(new globalThis.window.Event("click"));
  const links = [...page.root.querySelectorAll("#za-refs li a")];
  assert.equal(links.length, 2); // only the references with a DOI carry a link
  assert.ok(links.every((a) => a.href.startsWith("https://doi.org/10.1000/") && a.target === "_blank"));
});

test("the host can supply its own period picker", () => {
  const s = sample();
  const data = payload({ ...s, options: defaultOptions({ bulkThreshold: 100, language: "fr" }), linkPrefix: selectLink(s.library, "") });
  const calls = [];
  const { root } = mount(data, {
    select: (items, value, onChange, label) => {
      calls.push({ items, value, label });
      const el = globalThis.document.createElement("span");
      el.className = "fake-picker";
      el.addEventListener("click", () => onChange("1"));
      return el;
    },
  });
  assert.equal(root.querySelectorAll("#za-selection select").length, 0);
  assert.deepEqual(calls[0].items, [["", "Toute la période"], ["0", "2010"], ["1", "2011"], ["2", "2012"]]);
  assert.equal(calls[0].value, "");
  assert.equal(calls[0].label, "Période");
  root.querySelector(".fake-picker").dispatchEvent(new globalThis.window.Event("click"));
  assert.ok(root.querySelector("#za-count").textContent.includes("2011"));
  assert.equal(calls.at(-1).value, "1");
});
