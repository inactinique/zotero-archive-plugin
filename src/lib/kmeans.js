// k-means with k-means++ seeding, several restarts, and a seeded random
// source, so that the same data give the same clusters.

/** A small, fast, seedable pseudo-random generator (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function squaredDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

function seedCentres(points, k, random) {
  const n = points.length;
  const centres = [Array.from(points[Math.floor(random() * n)])];
  const nearest = new Float64Array(n).fill(Infinity);
  while (centres.length < k) {
    const last = centres[centres.length - 1];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = squaredDistance(points[i], last);
      if (d < nearest[i]) nearest[i] = d;
      total += nearest[i];
    }
    let r = random() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      r -= nearest[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centres.push(Array.from(points[chosen]));
  }
  return centres;
}

function lloyd(points, k, random, maxIter) {
  const n = points.length;
  const dim = points[0].length;
  const centres = seedCentres(points, k, random);
  const labels = new Int32Array(n).fill(-1);
  let inertia = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    inertia = 0;
    for (let i = 0; i < n; i++) {
      let bestD = Infinity;
      let best = 0;
      for (let j = 0; j < k; j++) {
        const d = squaredDistance(points[i], centres[j]);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
      inertia += bestD;
    }
    if (!changed) break;
    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const s = sums[labels[i]];
      const p = points[i];
      for (let d = 0; d < dim; d++) s[d] += p[d];
      counts[labels[i]]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] === 0) {
        // An empty cluster restarts at the point farthest from its own centre.
        let far = 0;
        let farD = -1;
        for (let i = 0; i < n; i++) {
          const d = squaredDistance(points[i], centres[labels[i]]);
          if (d > farD) {
            farD = d;
            far = i;
          }
        }
        centres[j] = Array.from(points[far]);
        continue;
      }
      for (let d = 0; d < dim; d++) centres[j][d] = sums[j][d] / counts[j];
    }
  }
  return { labels, inertia, centres };
}

/**
 * Cluster `points` (arrays of numbers) into `k` groups; return one label per point.
 * The best of `nInit` runs (lowest within-cluster sum of squares) is kept.
 */
export function kmeans(points, k, { nInit = 10, maxIter = 300, seed = 42 } = {}) {
  if (k < 1) throw new Error("k must be at least 1");
  if (points.length < k) throw new Error("fewer points than clusters");
  const random = mulberry32(seed);
  let best = null;
  for (let run = 0; run < nInit; run++) {
    const result = lloyd(points, k, random, maxIter);
    if (!best || result.inertia < best.inertia) best = result;
  }
  return best.labels;
}
