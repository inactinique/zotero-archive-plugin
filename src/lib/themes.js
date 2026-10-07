// Group references into themes and sub-themes, and describe each group.
//
// The recipe is the one popularised by BERTopic, kept explicit so that every
// step can be inspected (it is the one of themes.py in the Python version):
//
// 1. UMAP projects the embeddings to a few dimensions, preserving neighbourhoods;
// 2. k-means cuts that space into fine-grained sub-themes;
// 3. Ward's criterion merges the sub-themes, step by step, into broad themes;
// 4. class-based TF-IDF picks the words that set each group apart from the rest.

import { UMAP } from "umap-js";
import stopwordsISO from "stopwords-iso/stopwords-iso.json" with { type: "json" };
import { kmeans, mulberry32, squaredDistance } from "./kmeans.js";

// Languages whose function words are filtered out of the keywords.
export const STOPWORD_LANGUAGES = ["fr", "en", "de", "es", "it", "nl", "pt"];

// Bibliographic noise that says nothing about the subject of a reference.
export const EXTRA_STOPWORDS = new Set([
  "http", "https", "www", "doi", "org", "com", "html", "pdf", "isbn", "issn",
  "vol", "volume", "éd", "eds", "pp", "amp", "nbsp", "abstract", "résumé",
  "article", "paper", "chapter", "chapitre", "book", "livre", "ouvrage",
  "author", "authors", "auteur", "auteurs", "study", "étude",
]);

const TOKEN_RE = /\p{L}{3,}/gu;

/** A theme or a sub-theme. */
export function makeGroup(fields) {
  return {
    id: 0,
    size: 0,
    keywords: [],
    exemplars: [], // indices of the most central references
    collections: [], // [name, count] pairs: Zotero collections concentrated in the group
    tags: [],
    parent: null, // theme id, for sub-themes
    children: [], // sub-theme ids, for themes
    ...fields,
  };
}

/** The label used when nobody has named the group: its three top words. */
export function autoLabel(group, lang = "fr") {
  return group.keywords.slice(0, 3).join(" · ") || `${lang === "fr" ? "groupe" : "group"} ${group.id + 1}`;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function normalise(vector) {
  const norm = Math.sqrt(dot(vector, vector)) || 1;
  return Float32Array.from(vector, (v) => v / norm);
}

function mean(vectors, dim) {
  const m = new Float64Array(dim);
  for (const v of vectors) for (let d = 0; d < dim; d++) m[d] += v[d];
  for (let d = 0; d < dim; d++) m[d] /= vectors.length || 1;
  return m;
}

function median(values) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Position of each element once `keys` is sorted with `compare`. */
export function rank(keys, compare = (a, b) => a - b) {
  const order = keys.map((_, i) => i).sort((i, j) => compare(keys[i], keys[j]) || i - j);
  const result = new Int32Array(keys.length);
  order.forEach((index, position) => {
    result[index] = position;
  });
  return result;
}

/**
 * Merge clusters until `nGroups` remain, using Ward's criterion.
 *
 * At each step the two clusters whose fusion least increases the within-group
 * variance are merged. Unlike a plain hierarchical clustering of the
 * centroids, this accounts for cluster sizes: small clusters get absorbed
 * first, which keeps the broad themes comparable in weight.
 */
export function wardMerge(means, sizes, nGroups) {
  const mean = new Map(means.map((m, k) => [k, Float64Array.from(m)]));
  const size = new Map(Array.from(sizes, (s, k) => [k, Number(s)]));
  const members = new Map(means.map((_, k) => [k, [k]]));
  while (members.size > nGroups) {
    const keys = [...members.keys()];
    let best = null;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i];
        const b = keys[j];
        const sa = size.get(a);
        const sb = size.get(b);
        const cost = ((sa * sb) / (sa + sb)) * squaredDistance(mean.get(a), mean.get(b));
        if (!best || cost < best.cost) best = { cost, a, b };
      }
    }
    const { a, b } = best;
    const sa = size.get(a);
    const sb = size.get(b);
    const ma = mean.get(a);
    const mb = mean.get(b);
    for (let d = 0; d < ma.length; d++) ma[d] = (ma[d] * sa + mb[d] * sb) / (sa + sb);
    size.set(a, sa + sb);
    members.get(a).push(...members.get(b));
    members.delete(b);
    mean.delete(b);
    size.delete(b);
  }
  const parents = new Int32Array(means.length);
  let group = 0;
  for (const subs of members.values()) {
    for (const s of subs) parents[s] = group;
    group++;
  }
  return parents;
}

/**
 * Fit themes on the embeddings; return the model and each item's sub-theme.
 *
 * `embeddings` are L2-normalised vectors (one per reference), `timestamps`
 * the date each reference was added, as seconds. Themes and sub-themes are
 * numbered chronologically (by the median date at which their references
 * were added), so that ids read as a timeline.
 */
export async function fit(embeddings, timestamps, nThemes, nSubthemes, { seed = 42, onProgress } = {}) {
  const n = embeddings.length;
  const dim = embeddings[0].length;
  // Small libraries cannot support many groups: keep ~30 references per sub-theme.
  nSubthemes = Math.max(2, Math.min(nSubthemes, Math.floor(n / 30)));
  nThemes = Math.max(1, Math.min(nThemes, nSubthemes));

  const umap = new UMAP({
    nComponents: 5,
    nNeighbors: Math.min(15, n - 1),
    minDist: 0.0,
    distanceFn: (a, b) => 1 - dot(a, b), // cosine distance of unit vectors
    random: mulberry32(seed),
  });
  const data = embeddings.map((v) => Array.from(v));
  const nEpochs = umap.initializeFit(data);
  for (let epoch = 0; epoch < nEpochs; epoch++) {
    umap.step();
    if (onProgress && (epoch % 10 === 0 || epoch === nEpochs - 1)) {
      await onProgress("umap", epoch + 1, nEpochs);
    }
  }
  const reduced = umap.getEmbedding();

  let sub = kmeans(reduced, nSubthemes, { nInit: 10, seed });
  // Clusters left empty are dropped: ids are compacted.
  const present = [...new Set(sub)].sort((a, b) => a - b);
  if (present.length < nSubthemes) {
    const remap = new Map(present.map((k, i) => [k, i]));
    sub = Int32Array.from(sub, (k) => remap.get(k));
    nSubthemes = present.length;
    nThemes = Math.min(nThemes, nSubthemes);
  }

  const sizes = new Int32Array(nSubthemes);
  for (const k of sub) sizes[k]++;
  const members = Array.from({ length: nSubthemes }, () => []);
  sub.forEach((k, i) => members[k].push(embeddings[i]));
  const means = members.map((vectors) => mean(vectors, dim));
  let parents = wardMerge(means, sizes, nThemes);
  const nFound = Math.max(...parents) + 1;

  // Renumber: themes by median date, then sub-themes by (theme, median date).
  const themeMedian = Array.from({ length: nFound }, (_, t) => median(timestamps.filter((_, i) => parents[sub[i]] === t)));
  const themeRank = rank(themeMedian);
  parents = Int32Array.from(parents, (t) => themeRank[t]);
  const subMedian = Array.from({ length: nSubthemes }, (_, k) => median(timestamps.filter((_, i) => sub[i] === k)));
  const subRank = rank(
    Array.from({ length: nSubthemes }, (_, k) => [parents[k], subMedian[k]]),
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );
  const inverse = new Int32Array(nSubthemes); // inverse[position] = old id

  subRank.forEach((position, old) => {
    inverse[position] = old;
  });
  const model = {
    centroids: Array.from(inverse, (old) => normalise(means[old])),
    parents: Array.from(inverse, (old) => parents[old]),
  };
  return { model, sub: Int32Array.from(sub, (k) => subRank[k]) };
}

/** Attach references to the nearest existing sub-theme (cosine similarity). */
export function assign(model, embeddings) {
  return Int32Array.from(embeddings, (v) => {
    let best = 0;
    let bestScore = -Infinity;
    model.centroids.forEach((c, k) => {
      const score = dot(v, c);
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    });
    return best;
  });
}

export function nThemesOf(model) {
  return Math.max(...model.parents) + 1;
}

// ----- description: keywords, collections, exemplars -----

export function stopwords() {
  const words = new Set(EXTRA_STOPWORDS);
  for (const lang of STOPWORD_LANGUAGES) {
    for (const w of stopwordsISO[lang] || []) words.add(w);
  }
  return words;
}

/** Words and two-word phrases, e.g. "histoire", "histoire économique". */
export function tokenize(text, stop) {
  const words = (text.normalize("NFC").toLowerCase().match(TOKEN_RE) || []);
  const terms = words.filter((w) => !stop.has(w));
  for (let i = 0; i + 1 < words.length; i++) {
    const a = words[i];
    const b = words[i + 1];
    if (!stop.has(a) && !stop.has(b)) terms.push(`${a} ${b}`);
  }
  return terms;
}

/** A crude cross-language stem: "européenne", "european", "europe" -> "europ". */
export function stem(word) {
  return word.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").slice(0, 5);
}

function stemsOf(term) {
  return new Set(term.split(" ").map(stem));
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function intersects(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** Class-based TF-IDF: terms frequent in one group and rare in the others. */
export function keywords(counts, nKeywords, minCount = 3) {
  const totals = new Map();
  let grand = 0;
  for (const c of counts) {
    for (const [term, n] of c) {
      totals.set(term, (totals.get(term) || 0) + n);
      grand += n;
    }
  }
  const averageSize = grand / Math.max(counts.length, 1);
  const result = [];
  for (const c of counts) {
    let size = 0;
    for (const n of c.values()) size += n;
    size = Math.max(size, 1);
    const scored = [];
    for (const [term, tf] of c) {
      if (tf >= minCount) scored.push([(tf / size) * Math.log1p(averageSize / totals.get(term)), term]);
    }
    // Highest score first; equal scores are broken by the term, as Python's sort does.
    scored.sort((x, y) => y[0] - x[0] || (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
    let chosen = [];
    for (const [, term] of scored) {
      if (chosen.length === nKeywords) break;
      const words = term.split(" ");
      const stems = stemsOf(term);
      if (words.length === 2) {
        // A phrase replaces the single word it mostly accounts for
        // ("intelligence" -> "intelligence artificielle").
        const single = chosen.find((k) => !k.includes(" ") && stems.has(stem(k)));
        if (single === undefined) {
          if (!chosen.some((k) => sameSet(stemsOf(k), stems))) chosen.push(term);
        } else if (c.get(term) >= 0.5 * c.get(single)) {
          chosen[chosen.indexOf(single)] = term;
          chosen = chosen.filter((k) => k === term || k.includes(" ") || !stems.has(stem(k)));
        }
      } else if (!chosen.some((k) => intersects(stems, stemsOf(k)))) {
        chosen.push(term);
      }
    }
    result.push(chosen);
  }
  return result;
}

/** Per group, the collections or tags it concentrates (at least 3 references). */
export function concentrated(values, labels, nGroups, top = 5) {
  const perGroup = Array.from({ length: nGroups }, () => new Map());
  const overall = new Map();
  const sizes = new Int32Array(nGroups);
  values.forEach((vals, i) => {
    const g = labels[i];
    sizes[g]++;
    for (const v of vals) {
      perGroup[g].set(v, (perGroup[g].get(v) || 0) + 1);
      overall.set(v, (overall.get(v) || 0) + 1);
    }
  });
  return perGroup.map((counter, g) => {
    const scored = [];
    for (const [name, n] of counter) {
      // Favour names that are both common in the group and specific to it.
      if (n >= 3) scored.push([((n / Math.max(sizes[g], 1)) * n) / overall.get(name), n, name]);
    }
    scored.sort((x, y) => y[0] - x[0] || y[1] - x[1] || (y[2] > x[2] ? 1 : y[2] < x[2] ? -1 : 0));
    return scored.slice(0, top).map(([, n, name]) => [name, n]);
  });
}

/**
 * Build the description of every theme and sub-theme.
 *
 * `texts`, `collections` and `tags` are per reference, aligned with
 * `embeddings` and `subLabels`.
 */
export function describe(embeddings, subLabels, model, texts, collections, tags, nKeywords = 10) {
  const stop = stopwords();
  const tokens = texts.map((t) => tokenize(t, stop));
  const themeLabels = Int32Array.from(subLabels, (k) => model.parents[k]);
  const dim = embeddings[0]?.length || 0;

  function build(labels, n) {
    const counts = Array.from({ length: n }, () => new Map());
    tokens.forEach((toks, i) => {
      const c = counts[labels[i]];
      for (const t of toks) c.set(t, (c.get(t) || 0) + 1);
    });
    const kw = keywords(counts, nKeywords);
    const colls = concentrated(collections, labels, n);
    const tgs = concentrated(tags, labels, n);
    const groups = [];
    for (let g = 0; g < n; g++) {
      const members = [];
      labels.forEach((l, i) => {
        if (l === g) members.push(i);
      });
      let exemplars = [];
      if (members.length) {
        const centroid = mean(members.map((i) => embeddings[i]), dim);
        exemplars = members
          .map((i) => [dot(embeddings[i], centroid), i])
          .sort((a, b) => b[0] - a[0] || a[1] - b[1])
          .slice(0, 5)
          .map(([, i]) => i);
      }
      groups.push(makeGroup({ id: g, size: members.length, keywords: kw[g], exemplars, collections: colls[g], tags: tgs[g] }));
    }
    return groups;
  }

  const subthemes = build(subLabels, model.parents.length);
  const themes = build(themeLabels, nThemesOf(model));
  for (const s of subthemes) {
    s.parent = model.parents[s.id];
    themes[s.parent].children.push(s.id);
  }
  return { themes, subthemes };
}
