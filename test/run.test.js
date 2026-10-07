// Reusing or recomputing the themes across runs, with an in-memory store.
import { test } from "node:test";
import assert from "node:assert/strict";

import { loadOrFit } from "../src/lib/run.js";
import { mulberry32 } from "../src/lib/kmeans.js";
import { normalise } from "../src/lib/themes.js";

function memoryStore() {
  const files = new Map();
  return {
    files,
    async readJSON(name) {
      return files.has(name) ? JSON.parse(JSON.stringify(files.get(name))) : null;
    },
    async writeJSON(name, data) {
      files.set(name, JSON.parse(JSON.stringify(data)));
    },
    async copy(name, target) {
      if (files.has(name)) files.set(target, files.get(name));
    },
    async readVectors() {
      return new Map();
    },
    async writeVectors() {},
  };
}

function corpus(n = 150) {
  const random = mulberry32(3);
  const items = [];
  const vectors = [];
  for (let i = 0; i < n; i++) {
    const topic = i % 3;
    vectors.push(normalise(Array.from({ length: 8 }, (_, d) => (d === topic ? 1 : 0) + 0.1 * (random() - 0.5))));
    items.push({ key: `K${i}`, dateAdded: `20${10 + topic}-01-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z` });
  }
  return { items, vectors };
}

test("themes are reused, recomputed on request or when parameters change, and extended to new items", async () => {
  const store = memoryStore();
  const { items, vectors } = corpus();
  const params = { model: "m", themes: 3, subthemes: 5, exclude: [], library: 1 };
  const statuses = [];
  const onStatus = (step) => statuses.push(step);

  const first = await loadOrFit(store, items, vectors, params, false, { onStatus });
  assert.ok(first.fitted);
  assert.equal(first.sub.length, items.length);
  assert.ok(store.files.has("model.json"));

  const again = await loadOrFit(store, items, vectors, params, false, { onStatus });
  assert.ok(!again.fitted);
  assert.deepEqual(Array.from(again.sub), Array.from(first.sub));
  assert.equal(statuses.at(-1), "reused");

  // "Recompute the themes": a fresh fit even though nothing changed.
  const forced = await loadOrFit(store, items, vectors, params, true, { onStatus });
  assert.ok(forced.fitted);

  // More sub-themes asked for: the saved model no longer applies.
  const more = await loadOrFit(store, items, vectors, { ...params, subthemes: 4 }, false, { onStatus });
  assert.ok(more.fitted);
  assert.equal(statuses.at(-1), "params-changed");
  assert.equal(store.files.get("model.json").params.subthemes, 4);
  assert.equal(new Set(Array.from(more.sub)).size, 4);

  // A new reference joins the nearest existing sub-theme; the others keep theirs.
  const extra = { key: "NEW", dateAdded: "2012-06-01T00:00:00Z" };
  const grown = await loadOrFit(store, [...items, extra], [...vectors, vectors[2]], { ...params, subthemes: 4 }, false, { onStatus });
  assert.ok(!grown.fitted);
  assert.equal(statuses.at(-1), "attached");
  assert.deepEqual(Array.from(grown.sub).slice(0, items.length), Array.from(more.sub));
  assert.equal(grown.sub[items.length], more.sub[2]);
});
