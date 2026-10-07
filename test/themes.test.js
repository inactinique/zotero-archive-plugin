// Thematic model: merging, numbering, keywords.
import { test } from "node:test";
import assert from "node:assert/strict";

import * as T from "../src/lib/themes.js";
import { kmeans, mulberry32 } from "../src/lib/kmeans.js";

function gaussian(random) {
  // Box–Muller
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

test("ward merge absorbs small nearby clusters first", () => {
  // Two large clusters far apart, each with a small satellite.
  const means = [[0.0, 0.0], [0.2, 0.0], [5.0, 0.0], [5.2, 0.0]];
  const sizes = [100, 5, 100, 5];
  const parents = T.wardMerge(means, sizes, 2);
  assert.equal(parents[0], parents[1]);
  assert.equal(parents[2], parents[3]);
  assert.notEqual(parents[0], parents[2]);
});

test("kmeans separates obvious groups and is reproducible", () => {
  const random = mulberry32(1);
  const points = [];
  for (const centre of [[0, 0], [10, 10], [-10, 10]]) {
    for (let i = 0; i < 30; i++) points.push([centre[0] + gaussian(random), centre[1] + gaussian(random)]);
  }
  const a = kmeans(points, 3, { seed: 7 });
  const b = kmeans(points, 3, { seed: 7 });
  assert.deepEqual(Array.from(a), Array.from(b));
  for (const start of [0, 30, 60]) {
    assert.equal(new Set(a.slice(start, start + 30)).size, 1);
  }
  assert.equal(new Set(a).size, 3);
});

test("fit numbers themes chronologically and assign is consistent", async () => {
  const random = mulberry32(0);
  // Three well-separated topics, each added during its own period.
  const embeddings = [];
  const timestamps = [];
  [2000, 1000, 3000].forEach((period, k) => {
    // topic 1 is the oldest
    for (let i = 0; i < 80; i++) {
      const v = Array.from({ length: 16 }, (_, d) => (d === k ? 1 : 0) + 0.05 * gaussian(random));
      embeddings.push(T.normalise(v));
      timestamps.push(period + random() * 100);
    }
  });

  const { model, sub } = await T.fit(embeddings, timestamps, 3, 6);
  const theme = Array.from(sub, (k) => model.parents[k]);
  const majority = (slice) => {
    const counts = new Map();
    for (const t of slice) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  };
  // Each topic is one theme, and theme ids follow the order of addition.
  assert.deepEqual([0, 80, 160].map((i) => majority(theme.slice(i, i + 80))), [1, 0, 2]);
  for (const i of [0, 80, 160]) assert.equal(new Set(theme.slice(i, i + 80)).size, 1);
  // Sub-themes are numbered within their theme, themes in order.
  assert.deepEqual(model.parents, [...model.parents].sort((a, b) => a - b));
  // A new reference joins the theme of the nearest sub-theme.
  const assigned = T.assign(model, embeddings);
  assert.deepEqual(Array.from(assigned, (k) => model.parents[k]), theme);
});

test("tokenize keeps words and phrases without stopwords", () => {
  const terms = T.tokenize("L'histoire économique de la France en 1936", new Set(["de", "la", "en"]));
  assert.ok(terms.includes("histoire économique") && terms.includes("france"));
  assert.ok(!terms.includes("de") && !terms.includes("économique de") && !terms.includes("1936"));
});

test("keywords are distinctive and not redundant", () => {
  const counts = [
    new Map([["europe", 30], ["european", 25], ["européenne", 20], ["histoire", 40], ["intégration", 12]]),
    new Map([["intelligence", 30], ["intelligence artificielle", 28], ["histoire", 40], ["chatgpt", 9]]),
  ];
  const [first, second] = T.keywords(counts, 3);
  // One form per word family, across languages.
  assert.deepEqual(first, ["europe", "histoire", "intégration"]);
  // The phrase replaces the single word it mostly accounts for.
  assert.equal(second[0], "intelligence artificielle");
  assert.ok(!second.includes("intelligence"));
});

test("describe builds groups with keywords, collections and exemplars", () => {
  const embeddings = [[1, 0], [0.9, 0.1], [0.95, 0.05], [0, 1], [0.1, 0.9], [0.05, 0.95]].map(T.normalise);
  const sub = [0, 0, 0, 1, 1, 1];
  const model = { centroids: [T.normalise([1, 0]), T.normalise([0, 1])], parents: [0, 1] };
  const texts = ["banque monnaie", "banque crise", "banque finance", "twitter web", "twitter hashtag", "twitter réseau"];
  const collections = [["Thèse"], ["Thèse"], ["Thèse"], ["Web"], ["Web"], ["Web"]];
  const tags = texts.map(() => []);
  const { themes, subthemes } = T.describe(embeddings, sub, model, texts, collections, tags, 3);
  assert.equal(themes.length, 2);
  assert.equal(subthemes.length, 2);
  assert.equal(subthemes[0].parent, 0);
  assert.deepEqual(themes[1].children, [1]);
  assert.deepEqual(themes[0].keywords, ["banque"]);
  assert.deepEqual(themes[1].keywords, ["twitter"]);
  assert.deepEqual(themes[0].collections, [["Thèse", 3]]);
  assert.equal(themes[1].size, 3);
  assert.ok(themes[0].exemplars.every((i) => i < 3));
  assert.equal(T.autoLabel(themes[0]), "banque");
  assert.equal(T.autoLabel(T.makeGroup({ id: 4 }), "en"), "group 5");
});
