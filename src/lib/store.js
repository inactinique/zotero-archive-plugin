// Where the plugin keeps what it computes: one folder per library under
// Zotero's data directory, <data directory>/zotero-archive/<libraryID>/.
//
//   embeddings.json + embeddings.bin   the cached vectors (digest -> vector)
//   model.json                         the fitted themes, reused across runs
//   themes.json                        the labels, which the user may edit
//
// Nothing here is ever synced or published; it stays on this computer.

/* global IOUtils, PathUtils */

export function storePath(Zotero, libraryID) {
  return PathUtils.join(Zotero.DataDirectory.dir, "zotero-archive", String(libraryID));
}

export function createStore(dir) {
  const file = (name) => PathUtils.join(dir, name);
  const ensure = () => IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
  return {
    dir,

    async exists(name) {
      return IOUtils.exists(file(name));
    },

    async readJSON(name) {
      if (!(await IOUtils.exists(file(name)))) return null;
      return IOUtils.readJSON(file(name));
    },

    async writeJSON(name, data) {
      await ensure();
      await IOUtils.writeJSON(file(name), data);
    },

    async copy(name, target) {
      if (await IOUtils.exists(file(name))) await IOUtils.copy(file(name), file(target));
    },

    async remove(name) {
      await IOUtils.remove(file(name), { ignoreAbsent: true });
    },

    /** The cached vectors as a Map digest -> Float32Array, or an empty Map. */
    async readVectors(name) {
      const meta = await this.readJSON(`${name}.json`);
      if (!meta || !meta.digests?.length) return new Map();
      const bytes = await IOUtils.read(file(`${name}.bin`));
      const floats = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const cache = new Map();
      meta.digests.forEach((d, i) => cache.set(d, floats.subarray(i * meta.dim, (i + 1) * meta.dim)));
      return cache;
    },

    async writeVectors(name, cache) {
      await ensure();
      const digests = [...cache.keys()];
      const dim = digests.length ? cache.get(digests[0]).length : 0;
      const floats = new Float32Array(digests.length * dim);
      digests.forEach((d, i) => floats.set(cache.get(d), i * dim));
      await IOUtils.write(file(`${name}.bin`), new Uint8Array(floats.buffer));
      await IOUtils.writeJSON(file(`${name}.json`), { dim, digests });
    },
  };
}
