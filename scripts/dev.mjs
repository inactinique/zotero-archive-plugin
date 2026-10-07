// Run a separate Zotero with the plugin loaded from build/.
//
// A throw-away profile is created the first time, with its own data directory,
// so that the Zotero you use every day is never touched. The data directory may
// be seeded with a copy of a zotero.sqlite file (references only, no attachments).
//
//   node scripts/dev.mjs                 start (or restart) the development Zotero
//   node scripts/dev.mjs --stop          stop it
//   node scripts/dev.mjs --seed ~/Zotero/zotero.sqlite   copy that library on first run
//   node scripts/dev.mjs --home DIR      where profile/ and data/ live
//                                        (default: $ZOTERO_ARCHIVE_DEV_HOME or ~/.zotero-archive-dev)
//
// Zotero's debug output goes to <home>/zotero.log.

import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "src", "manifest.json"), "utf8"));
const PLUGIN_ID = manifest.applications.zotero.id;

const argv = process.argv.slice(2);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const HOME = path.resolve(option("--home") || process.env.ZOTERO_ARCHIVE_DEV_HOME || path.join(os.homedir(), ".zotero-archive-dev"));
const ZOTERO = option("--zotero") || process.env.ZOTERO_BINARY || "/Applications/Zotero.app/Contents/MacOS/zotero";
const PROFILE = path.join(HOME, "profile");
const DATA = path.join(HOME, "data");
const PID = path.join(HOME, "zotero.pid");
const LOG = path.join(HOME, "zotero.log");

function stop() {
  // Zotero may relaunch itself under another pid: stop every process started
  // with this profile, not only the one whose pid was recorded.
  const pids = new Set();
  if (existsSync(PID)) pids.add(Number(readFileSync(PID, "utf8")));
  try {
    const found = execFileSync("pgrep", ["-f", `zotero -profile ${PROFILE}`], { encoding: "utf8" });
    for (const line of found.split("\n")) if (line.trim()) pids.add(Number(line));
  } catch {
    // pgrep exits 1 when nothing matches
  }
  let stopped = false;
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      console.log(`stopped Zotero (pid ${pid})`);
      stopped = true;
    } catch {
      // already gone
    }
  }
  rmSync(PID, { force: true });
  return stopped;
}

function prepare() {
  mkdirSync(path.join(PROFILE, "extensions"), { recursive: true });
  mkdirSync(DATA, { recursive: true });

  const seed = option("--seed");
  const db = path.join(DATA, "zotero.sqlite");
  if (seed && !existsSync(db)) {
    copyFileSync(path.resolve(seed.replace(/^~/, os.homedir())), db);
    console.log(`copied ${seed} → ${db}`);
  }

  // Zotero loads a plugin from a directory when a file named after the plugin
  // id, in the profile's extensions/ folder, holds the directory's path.
  writeFileSync(path.join(PROFILE, "extensions", PLUGIN_ID), path.join(ROOT, "build") + path.sep);

  // user.js is applied at every start. It points Zotero to the data directory,
  // keeps it quiet (no sync, no first-run dialogs) and moves its local HTTP
  // server away from the port of the regular Zotero.
  const prefs = {
    "extensions.zotero.useDataDir": true,
    "extensions.zotero.dataDir": DATA,
    "extensions.zotero.firstRun2": false,
    "extensions.zotero.firstRunGuidance": false,
    "extensions.zotero.sync.autoSync": false,
    "extensions.zotero.automaticScraperUpdates": false,
    "extensions.zotero.httpServer.port": 23129,
    // Development conveniences read by the plugin: open the archive window at start.
    "extensions.zotero.zoteroArchive.devAutoOpen": true,
    // --autobuild: also run the analysis of the first library as soon as the window opens.
    "extensions.zotero.zoteroArchive.devAutoBuild": argv.includes("--autobuild"),
    // --export-dir DIR: after each analysis, write every export variant into DIR.
    "extensions.zotero.zoteroArchive.devExportDir": option("--export-dir") ? path.resolve(option("--export-dir")) : "",
    // --open-export KIND: then open that exported page (private, web, webReferences,
    // fragment, fragmentReferences) in Zotero's viewer.
    "extensions.zotero.zoteroArchive.devOpenExport": option("--open-export") || "",
    // --open-dropdown: open the library menu as soon as the window appears (to check its rendering).
    "extensions.zotero.zoteroArchive.devOpenDropdown": argv.includes("--open-dropdown"),
    // --themes N, --subthemes N, --refit: preset the toolbar.
    ...(option("--themes") ? { "extensions.zotero.zoteroArchive.themes": Number(option("--themes")) } : {}),
    ...(option("--subthemes") ? { "extensions.zotero.zoteroArchive.subthemes": Number(option("--subthemes")) } : {}),
    "extensions.zotero.zoteroArchive.devRefit": argv.includes("--refit"),
    // --palette normal|colorblind: the colours of the themes.
    ...(option("--palette") ? { "extensions.zotero.zoteroArchive.palette": option("--palette") } : {}),
    // --engine local|ollama: which embedding engine the window uses.
    ...(option("--engine") ? { "extensions.zotero.zoteroArchive.embedEngine": option("--engine") } : {}),
    "extensions.zotero.debug.log": false,
    "app.update.enabled": false,
    "app.update.auto": false,
    "browser.dom.window.dump.enabled": true,
    "devtools.chrome.enabled": true,
    // A plugin found in the profile is enabled at once instead of being auto-disabled.
    "extensions.autoDisableScopes": 0,
    "extensions.enabledScopes": 15,
    "extensions.startupScanScopes": 15,
    "extensions.lastAppBuildId": "",
    "extensions.lastAppVersion": "",
  };
  const lines = Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`);
  writeFileSync(path.join(PROFILE, "user.js"), lines.join("\n") + "\n");

  // Make Zotero rescan the extensions at start, as its documentation advises,
  // and forget what it knew about them, so that a plugin disabled once is retried.
  for (const f of ["extensions.json", "addonStartup.json.lz4"]) rmSync(path.join(PROFILE, f), { force: true });
  const prefsJs = path.join(PROFILE, "prefs.js");
  if (existsSync(prefsJs)) {
    const kept = readFileSync(prefsJs, "utf8")
      .split("\n")
      .filter((l) => !/extensions\.lastApp(BuildId|Version)/.test(l));
    writeFileSync(prefsJs, kept.join("\n"));
  }
}

function start() {
  if (!existsSync(ZOTERO)) {
    console.error(`Zotero not found at ${ZOTERO} (set ZOTERO_BINARY or --zotero)`);
    process.exit(1);
  }
  if (!existsSync(path.join(ROOT, "build", "manifest.json"))) {
    execFileSync(process.execPath, [path.join(ROOT, "scripts", "build.mjs")], { stdio: "inherit" });
  }
  const log = openSync(LOG, "w");
  const child = spawn(
    ZOTERO,
    ["-profile", PROFILE, "-no-remote", "-purgecaches", "-ZoteroDebugText"],
    { detached: true, stdio: ["ignore", log, log] }
  );
  child.unref();
  writeFileSync(PID, String(child.pid));
  console.log(`Zotero started (pid ${child.pid})\n  profile: ${PROFILE}\n  data:    ${DATA}\n  log:     ${LOG}`);
}

if (argv.includes("--stop")) {
  if (!stop()) console.log("not running");
} else {
  stop();
  prepare();
  start();
}
