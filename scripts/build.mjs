// Build the plugin: bundle the scripts with esbuild, copy the static files,
// stamp the version from package.json, and optionally zip an XPI.
//
//   node scripts/build.mjs            build once into build/
//   node scripts/build.mjs --watch    rebuild whenever src/ changes
//   node scripts/build.mjs --xpi      build, then write zotero-archive-<version>.xpi

import { context } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";
import AdmZip from "adm-zip";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "build");
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const args = new Set(process.argv.slice(2));

// Files copied as they are: everything that is not bundled JavaScript.
const STATIC = [
  "bootstrap.js",
  "plugin.js",
  "prefs.js",
  "locale",
  "content/archive.html",
  "content/archive.css",
  "content/page.css",
  "content/page.html",
  "content/prefs.xhtml",
  "content/prefs.js",
  "content/icons",
];

// Entry points bundled by esbuild. Each one becomes a single classic script
// (IIFE), which is what Zotero's chrome documents load.
const ENTRIES = {
  "content/archive.js": "content/archive.js",
  "content/page.js": "page/standalone.js",
};

// The ONNX runtime's WebAssembly files, served next to the engine.
const VENDOR = {
  "content/vendor/ort-wasm-simd-threaded.mjs": "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
  "content/vendor/ort-wasm-simd-threaded.wasm": "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
};

function copyStatic() {
  for (const [to, from] of Object.entries(VENDOR)) {
    const source = path.join(ROOT, from);
    if (existsSync(source)) cpSync(source, path.join(OUT, to));
  }
  for (const rel of STATIC) {
    const from = path.join(SRC, rel);
    if (!existsSync(from)) continue;
    cpSync(from, path.join(OUT, rel), { recursive: true });
  }
  const manifest = JSON.parse(readFileSync(path.join(SRC, "manifest.json"), "utf8"));
  manifest.version = pkg.version;
  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  copyStatic();

  const ctx = await context({
    entryPoints: Object.fromEntries(
      Object.entries(ENTRIES)
        .filter(([, src]) => existsSync(path.join(SRC, src)))
        .map(([out, src]) => [out.replace(/\.js$/, ""), path.join(SRC, src)])
    ),
    outdir: OUT,
    bundle: true,
    format: "iife",
    target: ["firefox115"], // Zotero 7.0 is built on Firefox 115
    platform: "browser",
    sourcemap: args.has("--watch") ? "inline" : false,
    minify: false,
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".html": "text", ".css": "text" },
    logLevel: "info",
  });

  // The in-plugin engine is an ES module loaded on demand by the window.
  const engine = await context({
    entryPoints: { "content/engine-local": path.join(SRC, "engine", "local.js") },
    outdir: OUT,
    bundle: true,
    // Zotero has no WebGPU: the plain WebAssembly build of the ONNX runtime is enough.
    alias: { "onnxruntime-web/webgpu": "onnxruntime-web" },
    format: "esm",
    target: ["firefox115"],
    platform: "browser",
    sourcemap: false,
    minify: true,
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "info",
  });

  if (args.has("--watch")) {
    await ctx.watch();
    await engine.watch();
    watch(SRC, { recursive: true }, (_event, file) => {
      if (file && !file.endsWith(".js")) {
        copyStatic();
        console.log(`static: ${file}`);
      }
    });
    console.log("watching src/ …");
    return;
  }

  await ctx.rebuild();
  await ctx.dispose();
  await engine.rebuild();
  await engine.dispose();

  if (args.has("--xpi")) {
    const xpi = path.join(ROOT, `zotero-archive-${pkg.version}.xpi`);
    rmSync(xpi, { force: true });
    const zip = new AdmZip();
    zip.addLocalFolder(OUT);
    zip.writeZip(xpi);
    console.log(`wrote ${path.relative(ROOT, xpi)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
