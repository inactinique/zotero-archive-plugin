// Turn each reference into a vector with a multilingual sentence-embedding
// model, through an "engine" (Ollama for now). Vectors are cached by the
// caller: only new or modified references are embedded on later runs.

export const DEFAULT_MODEL = "paraphrase-multilingual"; // Ollama
export const DEFAULT_LOCAL_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"; // in-plugin engine

// Abstracts are occasionally whole pasted articles; the model only reads the
// first few hundred tokens anyway.
export const MAX_CHARS = 2000;

const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

/** A key for the cache: the model and the text, hashed. */
export async function digest(modelName, text) {
  const data = new TextEncoder().encode(`${modelName}\n${text}`);
  return hex(await crypto.subtle.digest("SHA-1", data));
}

function normalise(vector) {
  let s = 0;
  for (const v of vector) s += v * v;
  const norm = Math.sqrt(s) || 1;
  return Float32Array.from(vector, (v) => v / norm);
}

/**
 * One L2-normalised vector per text.
 *
 * `cache` maps digests to vectors and is updated in place; `engine.embed(texts)`
 * returns one numeric array per text. The result tells how many vectors were
 * computed, so that the caller knows whether to save the cache.
 */
export async function embedTexts(texts, { engine, modelName, cache, batchSize = 32, onProgress } = {}) {
  const cut = texts.map((t) => t.slice(0, MAX_CHARS));
  const digests = await Promise.all(cut.map((t) => digest(modelName, t)));
  const missing = [];
  digests.forEach((d, i) => {
    if (!cache.has(d)) missing.push(i);
  });
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const vectors = await engine.embed(batch.map((i) => cut[i]));
    batch.forEach((i, j) => cache.set(digests[i], normalise(vectors[j])));
    await onProgress?.(Math.min(start + batchSize, missing.length), missing.length);
  }
  return {
    vectors: digests.map((d) => cache.get(d)),
    digests,
    computed: missing.length,
  };
}

/** Drop cached vectors no longer in use, so the cache does not grow forever. */
export function pruneCache(cache, digests) {
  const keep = new Set(digests);
  for (const d of [...cache.keys()]) if (!keep.has(d)) cache.delete(d);
}
