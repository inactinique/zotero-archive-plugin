// The in-plugin embedding engine: transformers.js running an ONNX model in
// WebAssembly, inside Zotero, with no other software installed.
//
// This module is bundled on its own (content/engine-local.js) and loaded only
// when the engine is chosen, since it weighs a few megabytes. Model files are
// downloaded from the Hugging Face Hub once and kept in Zotero's data
// directory; the ONNX runtime's WebAssembly files ship with the plugin.

/* global IOUtils, PathUtils */

import { env, pipeline } from "@huggingface/transformers";

const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

/** A Cache-like store (match/put) backed by files, for transformers.js. */
function fileCache(dir) {
  const pathFor = async (key) => {
    const url = typeof key === "string" ? key : key.url;
    const digest = hex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(url)));
    const name = url.split("/").pop().replace(/[^\w.-]/g, "_").slice(0, 60);
    return PathUtils.join(dir, `${digest}-${name}`);
  };
  return {
    async match(key) {
      const path = await pathFor(key);
      if (!(await IOUtils.exists(path))) return undefined;
      const bytes = await IOUtils.read(path);
      return new Response(bytes, { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    },
    async put(key, response) {
      await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
      const bytes = new Uint8Array(await response.arrayBuffer());
      await IOUtils.write(await pathFor(key), bytes);
    },
  };
}

/**
 * Load a sentence-embedding model and return an engine with `embed(texts)`.
 *
 * `vendorURL` is where the ONNX runtime's .mjs/.wasm files are served from,
 * `cacheDir` where the model files are kept, `onProgress` receives
 * transformers.js progress events ({status, file, progress...}).
 */
export async function createLocalEngine({ modelName, vendorURL, cacheDir, onProgress, dtype = "q8" }) {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.useCustomCache = true;
  env.customCache = fileCache(cacheDir);
  // Name the runtime files explicitly: the runtime would otherwise pick a
  // variant (WebGPU, JSPI) that this environment does not support.
  env.backends.onnx.wasm.wasmPaths = {
    mjs: vendorURL + "ort-wasm-simd-threaded.mjs",
    wasm: vendorURL + "ort-wasm-simd-threaded.wasm",
  };
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;

  const extractor = await pipeline("feature-extraction", modelName, {
    device: "wasm",
    dtype,
    progress_callback: onProgress,
  });
  return {
    name: modelName,
    async embed(texts) {
      const output = await extractor(texts, { pooling: "mean", normalize: true });
      const vectors = output.tolist();
      output.dispose?.();
      return vectors;
    },
    async dispose() {
      await extractor.dispose?.();
    },
  };
}
