// Naming themes with a local language model, without a real model.
import { test } from "node:test";
import assert from "node:assert/strict";

import * as labelling from "../src/lib/labels.js";
import { checkModel, OllamaError } from "../src/lib/ollama.js";
import { resolveLabels, themesDocument, labelKey } from "../src/lib/pipeline.js";
import { makeGroup } from "../src/lib/themes.js";

const group = (id, keywords, fields = {}) => makeGroup({ id, keywords, size: 10, exemplars: [0], ...fields });

const THEMES = [
  group(0, ["banque", "monnaie", "crise"], { children: [0, 1] }),
  group(1, ["twitter", "archives", "web"], { children: [2] }),
];
const SUBTHEMES = [
  group(0, ["reichsbank", "schacht"], { parent: 0 }),
  group(1, ["franc", "poincaré"], { parent: 0, collections: [["Thèse", 4]] }),
  group(2, ["tweets", "hashtag"], { parent: 1 }),
];
const ITEMS = [{ key: "K", itemType: "book", dateAdded: "2010-01-01T00:00:00Z", title: "Un titre représentatif" }];

test("clean removes quotes, final period and line breaks", () => {
  assert.equal(labelling.clean(" « Banques centrales\n et   monnaie. » "), "Banques centrales et monnaie");
  assert.equal(labelling.clean('"IA et histoire"'), "IA et histoire");
  assert.equal(labelling.clean("memory and history"), "Memory and history");
  assert.ok(labelling.clean("mot ".repeat(100)).length <= labelling.MAX_LENGTH);
});

test("description of a theme lists its parts and its neighbours", () => {
  const text = labelling.describe(THEMES[0], ["Titre A"], { parts: SUBTHEMES.slice(0, 2), others: THEMES.slice(1) });
  assert.ok(text.includes("banque, monnaie, crise"));
  assert.ok(text.includes("- 10 : reichsbank, schacht") && text.includes("- 10 : franc, poincaré"));
  assert.ok(text.includes("- Titre A"));
  assert.ok(text.includes("à ne pas confondre avec celui-ci : twitter, archives, web"));
});

test("description of a sub-theme names its theme and collections", () => {
  const text = labelling.describe(SUBTHEMES[1], ["Titre B"], { parent: THEMES[0], others: SUBTHEMES.slice(0, 1) });
  assert.ok(text.includes("fait partie d’un thème plus large : banque, monnaie, crise"));
  assert.ok(text.includes("Thèse (4)"));
  assert.ok(!text.includes("Sous-ensembles"));
});

test("language can be given by code or by name", () => {
  assert.deepEqual(["EN", "English", " anglais ", "de", "Deutsch"].map(labelling.languageKey), ["en", "en", "en", "de", "de"]);
  assert.equal(labelling.languageName("en"), "English");
  // An unlisted language is handed to the model as written.
  assert.equal(labelling.languageKey("Polish"), "polish");
  assert.equal(labelling.languageName("polish"), "polish");
  assert.throws(() => labelling.languageKey("  "));
});

test("description in another language is in English and restates the language", () => {
  const text = labelling.describe(SUBTHEMES[1], ["Titre B"], { parent: THEMES[0], others: SUBTHEMES.slice(0, 1), language: "de" });
  assert.ok(text.includes("Distinctive words: franc, poincaré."));
  assert.ok(text.includes("belongs to a broader theme: banque, monnaie, crise"));
  assert.ok(text.endsWith("Label for this group, in German:"));
  assert.ok(!text.includes("Mots caractéristiques"));
});

test("propose asks for the requested language", async () => {
  const sent = [];
  const call = async (url, path, body) => {
    sent.push(body);
    const field = body.format.required[0];
    return { message: { content: JSON.stringify({ [field]: "Central banks" }) } };
  };
  assert.equal(await labelling.propose("modele", "description", { language: "en", call }), "Central banks");
  assert.equal(await labelling.propose("modele", "description", { language: "fr", call }), "Central banks");
  const [english, french] = sent;
  assert.deepEqual(english.format.required, ["label_in_english"]);
  assert.ok(english.messages[0].content.includes("write the label in English"));
  assert.deepEqual(french.format.required, ["label"]);
  assert.ok(french.messages[0].content.includes("en français"));
});

test("propose reads the label and tolerates a useless answer", async () => {
  const answers = ['{"label": "« Banques centrales. »"}', "pas du JSON", '{"autre": 1}'];
  const sent = [];
  const call = async (url, path, body) => {
    sent.push([url, path, body]);
    return { message: { content: answers.shift() } };
  };
  assert.equal(await labelling.propose("modele", "description", { url: "http://ollama", call }), "Banques centrales");
  assert.equal(await labelling.propose("modele", "description", { call }), "");
  assert.equal(await labelling.propose("modele", "description", { call }), "");
  const [url, path, body] = sent[0];
  assert.deepEqual([url, path, body.model, body.stream], ["http://ollama", "/api/chat", "modele", false]);
  assert.deepEqual(body.messages.at(-1), { role: "user", content: "description" });
});

test("check reports a missing model and an unreachable server", async () => {
  const fetchFn = async () => new Response(JSON.stringify({ models: [{ name: "qwen3:8b" }, { name: "nomic:latest" }] }));
  await checkModel("qwen3:8b", "http://x", { fetchFn });
  await checkModel("nomic", "http://x", { fetchFn }); // Ollama lists it as nomic:latest
  await assert.rejects(checkModel("absent", "http://x", { fetchFn }), (e) => e instanceof OllamaError && e.message.startsWith("missing:absent:"));
  await assert.rejects(checkModel("qwen3:8b", "http://127.0.0.1:9"), (e) => e instanceof OllamaError && e.message.startsWith("unreachable:")); // nothing listens there
});

// ----- labels over successive runs -----

function state() {
  const calls = [];
  return {
    doc: null,
    calls,
    propose: async (name, description, language) => {
      calls.push([name, description, language]);
      return `Nom ${calls.length} (${name}, ${language})`;
    },
  };
}

async function labelsFor(s, { keep = true, labelModel = null, labelLanguage = null } = {}) {
  const labels = await resolveLabels({
    previous: s.doc, themes: THEMES, subthemes: SUBTHEMES, items: ITEMS, keep,
    labelModel, labelLanguage, language: "fr", propose: s.propose,
  });
  s.doc = themesDocument(THEMES, SUBTHEMES, labels, ITEMS, "fr");
  return labels;
}

const text = (labels, kind, id) => labels.get(labelKey(kind, id)).text;

test("without a model labels are the distinctive words", async () => {
  const s = state();
  const labels = await labelsFor(s);
  assert.equal(text(labels, "theme", 0), "banque · monnaie · crise");
  assert.deepEqual(new Set([...labels.values()].map((l) => l.source)), new Set(["keywords"]));
  assert.equal(s.calls.length, 0);
});

test("model names every group once and names persist", async () => {
  const s = state();
  const labels = await labelsFor(s, { labelModel: "m1" });
  assert.equal(s.calls.length, 5); // two themes, three sub-themes
  assert.equal(text(labels, "theme", 0), "Nom 1 (m1, fr)");
  assert.equal(labels.get(labelKey("sub", 2)).source, "ollama:m1");
  // The theme is described with its parts, the sub-theme with its theme.
  assert.ok(s.calls[0][1].includes("Sous-ensembles") && s.calls[2][1].includes("thème plus large"));

  // Later runs reuse the names, with or without the option: the model is not called again.
  assert.equal(text(await labelsFor(s, { labelModel: "m1" }), "theme", 0), "Nom 1 (m1, fr)");
  assert.equal(text(await labelsFor(s), "theme", 0), "Nom 1 (m1, fr)");
  assert.equal(s.calls.length, 5);
});

test("another language renames the groups and is remembered", async () => {
  const s = state();
  await labelsFor(s, { labelModel: "m1" });
  const labels = await labelsFor(s, { labelModel: "m1", labelLanguage: "en" });
  assert.equal(s.calls.length, 10);
  assert.equal(text(labels, "theme", 0), "Nom 6 (m1, en)");
  assert.equal(labels.get(labelKey("theme", 0)).language, "en");
  // The description handed to the model is in English and names the language.
  assert.ok(s.calls[5][1].endsWith("Label for this group, in English:") && s.calls[5][2] === "en");
  assert.equal(s.doc.themes[0].label_language, "en");

  // English names persist without the options, and asking for English again calls nothing.
  assert.equal(text(await labelsFor(s), "theme", 0), "Nom 6 (m1, en)");
  await labelsFor(s, { labelModel: "m1", labelLanguage: "en" });
  assert.equal(s.calls.length, 10);
});

test("names obtained before the language option count as French", async () => {
  const s = state();
  await labelsFor(s, { labelModel: "m1" });
  for (const theme of s.doc.themes) {
    for (const entry of [theme, ...theme.subthemes]) delete entry.label_language; // as written by an older version
  }
  assert.equal(text(await labelsFor(s, { labelModel: "m1" }), "theme", 0), "Nom 1 (m1, fr)");
  assert.equal(s.calls.length, 5);
});

test("a label rewritten by the user wins over any proposal", async () => {
  const s = state();
  await labelsFor(s, { labelModel: "m1" });
  s.doc.themes[0].label = "Histoire monétaire";
  assert.equal(text(await labelsFor(s), "theme", 0), "Histoire monétaire");
  // Another model renames the groups, but not the one named by hand.
  const labels = await labelsFor(s, { labelModel: "m2" });
  assert.equal(s.calls.length, 10);
  assert.equal(text(labels, "theme", 0), "Histoire monétaire");
  assert.equal(labels.get(labelKey("theme", 0)).source, "ollama:m2");
  assert.ok(text(labels, "theme", 1).endsWith("(m2, fr)"));
});

test("recomputed themes start from scratch", async () => {
  const s = state();
  await labelsFor(s, { labelModel: "m1" });
  const labels = await labelsFor(s, { keep: false });
  assert.equal(text(labels, "theme", 0), "banque · monnaie · crise");
});

test("an empty answer falls back to the words and is retried", async () => {
  const s = state();
  s.propose = async () => "";
  let labels = await labelsFor(s, { labelModel: "m1" });
  assert.equal(text(labels, "sub", 0), "reichsbank · schacht");
  assert.equal(labels.get(labelKey("sub", 0)).source, "keywords");
  s.propose = async () => "Reichsbank";
  labels = await labelsFor(s, { labelModel: "m1" });
  assert.equal(text(labels, "sub", 0), "Reichsbank");
});

test("the themes document is in the language of the page", () => {
  const labels = new Map();
  for (const t of THEMES) labels.set(labelKey("theme", t.id), { text: "T", auto: "T", source: "keywords", language: "" });
  for (const s of SUBTHEMES) labels.set(labelKey("sub", s.id), { text: "S", auto: "S", source: "keywords", language: "" });
  const en = themesDocument(THEMES, SUBTHEMES, labels, ITEMS, "en");
  assert.ok(en.help.startsWith("To rename"));
  assert.deepEqual(en.themes[0].subthemes[1].collections, ["Thèse (4)"]);
  assert.deepEqual(en.themes[0].exemplars, ["Un titre représentatif"]);
});
