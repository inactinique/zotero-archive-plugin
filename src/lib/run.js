// From the references of a library to the described themes: the whole chain,
// with everything that touches the outside world (storage, models) injected.

import { embedTexts, pruneCache } from "./embed.js";
import { itemText } from "./extract.js";
import { excludeCollections, MIN_ITEMS, resolveLabels, themesDocument, timestamps } from "./pipeline.js";
import * as thematic from "./themes.js";

export class TooFewItems extends Error {
  constructor(n) {
    super(`too few items: ${n} < ${MIN_ITEMS}`);
    this.n = n;
  }
}

const sameParams = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Reuse the saved themes when possible, so that they stay stable over time.
 *
 * References already seen keep their sub-theme; new ones join the nearest
 * sub-theme. Themes are only recomputed on request or when parameters change.
 */
export async function loadOrFit(store, items, vectors, params, refit, { onStatus, onProgress } = {}) {
  const keys = items.map((it) => it.key);
  let model = null;
  let sub = null;
  const saved = refit ? null : await store.readJSON("model.json");
  if (saved) {
    if (sameParams(saved.params, params)) {
      model = { centroids: saved.centroids.map((c) => Float32Array.from(c)), parents: saved.parents };
      const known = new Map(saved.keys.map((k, i) => [k, saved.sub[i]]));
      sub = Int32Array.from(keys, (k) => known.get(k) ?? -1);
      const fresh = [];
      sub.forEach((k, i) => {
        if (k < 0) fresh.push(i);
      });
      if (fresh.length) {
        const assigned = thematic.assign(model, fresh.map((i) => vectors[i]));
        fresh.forEach((i, j) => {
          sub[i] = assigned[j];
        });
        await onStatus?.("attached", fresh.length);
      } else {
        await onStatus?.("reused");
      }
    } else {
      await onStatus?.("params-changed");
    }
  }
  const fitted = model === null;
  if (fitted) {
    ({ model, sub } = await thematic.fit(vectors, timestamps(items), params.themes, params.subthemes, { onProgress }));
  }
  await store.writeJSON("model.json", {
    params,
    centroids: model.centroids.map((c) => Array.from(c)),
    parents: Array.from(model.parents),
    keys,
    sub: Array.from(sub),
  });
  return { model, sub, fitted };
}

/**
 * Analyse a library. Returns what the page needs: items, their sub-theme,
 * the described groups and their labels.
 *
 * `engine.embed(texts)` embeds texts; `propose(model, description, language)`
 * names a group; `store` persists the cache, the model and the labels.
 * `onStatus(step, detail)` and `onProgress(step, done, total)` report progress.
 */
export async function run({ library, items, options, store, engine, propose, onStatus, onProgress }) {
  const nRead = items.length;
  items = excludeCollections(items, options.exclude);
  await onStatus?.("read", { library: library.name, n: items.length, excluded: nRead - items.length });
  if (items.length < MIN_ITEMS) throw new TooFewItems(items.length);

  const texts = items.map(itemText);
  await onStatus?.("embedding");
  // One cache per model, so that switching engines does not throw vectors away.
  const cacheName = "embeddings-" + options.modelName.replace(/[^\w.-]+/g, "_");
  const cache = await store.readVectors(cacheName);
  const { vectors, digests, computed } = await embedTexts(texts, {
    engine,
    modelName: options.modelName,
    cache,
    onProgress: (done, total) => onProgress?.("embedding", done, total),
  });
  if (computed) {
    pruneCache(cache, digests);
    await store.writeVectors(cacheName, cache);
  }

  await onStatus?.("themes");
  const params = {
    model: options.modelName,
    themes: options.nThemes,
    subthemes: options.nSubthemes,
    exclude: [...options.exclude].sort(),
    library: library.id,
  };
  const { model, sub, fitted } = await loadOrFit(store, items, vectors, params, options.refit, {
    onStatus: (step, detail) => onStatus?.(step, detail),
    onProgress: (step, done, total) => onProgress?.(step, done, total),
  });
  const { themes, subthemes } = thematic.describe(
    vectors, sub, model, texts,
    items.map((it) => it.collections), items.map((it) => it.tags)
  );

  const previous = await store.readJSON("themes.json");
  if (previous && fitted) await store.copy("themes.json", "themes.json.bak");
  if (options.labelModel) await onStatus?.("labelling", { model: options.labelModel });
  const labels = await resolveLabels({
    previous, themes, subthemes, items, keep: !fitted,
    labelModel: options.labelModel, labelLanguage: options.labelLanguage, language: options.language,
    propose,
    onProgress: (done, total) => onProgress?.("labelling", done, total),
  });
  await store.writeJSON("themes.json", themesDocument(themes, subthemes, labels, items, options.language));

  return { library, items, sub: Array.from(sub), themes, subthemes, labels, fitted };
}
