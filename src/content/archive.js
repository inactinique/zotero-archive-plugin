// The archive window. Runs with Zotero's privileges: it reads the library
// through the Zotero API, talks to Ollama on this machine, and keeps its
// results in Zotero's data directory.

import { listLibraries, loadItems, selectLink } from "../lib/extract.js";
import { DEFAULT_LOCAL_MODEL, DEFAULT_MODEL } from "../lib/embed.js";
import { languageKey, propose as proposeLabel } from "../lib/labels.js";
import * as ollama from "../lib/ollama.js";
import { MAX_THEMES, MIN_ITEMS, PAGE, defaultOptions, labelKey, payload } from "../lib/pipeline.js";
import { run, TooFewItems } from "../lib/run.js";
import { createStore, storePath } from "../lib/store.js";
import { renderArchive } from "../page/page.js";
import pageMarkup from "./page.html";
import pageStyle from "./page.css";
import { createDropdown } from "./dropdown.js";

const { Zotero } = ChromeUtils.importESModule("chrome://zotero/content/zotero.mjs");

const $ = (id) => document.getElementById(id);
const lang = (Zotero.locale || "en").toLowerCase().startsWith("fr") ? "fr" : "en";

// Texts of the window itself; the page has its own, in page.js.
const UI = {
  fr: {
    library: "Bibliothèque",
    themes: "Thèmes",
    subthemes: "Sous-thèmes",
    label: (model) => `Nommer les thèmes avec ${model}`,
    refit: "Recalculer les thèmes",
    build: "Analyser",
    building: "Analyse en cours…",
    intro: "Choisissez une bibliothèque, puis lancez l’analyse. Tout se passe sur cet ordinateur : la bibliothèque est lue par Zotero, les modèles tournent dans Ollama ou dans Zotero même, selon les préférences.",
    read: ({ n, excluded }) => `${n} références${excluded ? ` (${excluded} écartées)` : ""}`,
    embedding: "Représentation des références…",
    embeddingProgress: (done, total) => `Représentation des références : ${done}/${total}`,
    themesStep: "Thèmes…",
    umap: (done, total) => `Projection des références : ${Math.round((100 * done) / total)} %`,
    attached: (n) => `${n} nouvelles références rattachées aux thèmes existants`,
    reused: "Thèmes repris du calcul précédent",
    paramsChanged: "Paramètres modifiés : les thèmes sont recalculés",
    labelling: ({ model }) => `Libellés proposés par ${model}…`,
    labellingProgress: (done, total) => `Libellés proposés par le modèle : ${done}/${total}`,
    done: (n, seconds) => `${n} références analysées en ${seconds} s`,
    tooFew: (n) => `Il faut au moins ${MIN_ITEMS} références pour dégager des thèmes (${n} trouvées).`,
    unreachable: (url) => `Ollama ne répond pas à l’adresse ${url}. Lancez l’application Ollama, puis réessayez.`,
    missing: (model, available) => `Le modèle « ${model} » n’est pas installé dans Ollama (disponibles : ${available || "aucun"}). Installez-le avec « ollama pull ${model} ».`,
    ollamaError: (detail) => `Ollama a répondu par une erreur : ${detail}`,
    loadingEngine: (model) => `Chargement du modèle ${model} dans Zotero…`,
    downloading: (file, pct) => `Téléchargement du modèle (une seule fois) : ${file} ${pct} %`,
    export: "Exporter…",
    exportKinds: {
      private: "Page privée (liens vers Zotero)",
      web: "Page pour le web (graphiques seuls)",
      webReferences: "Page pour le web, avec les références",
      fragment: "Fragment pour un site (graphiques seuls)",
      fragmentReferences: "Fragment pour un site, avec les références",
    },
    exportTitle: "Enregistrer la page",
    exported: (path) => `Page enregistrée : ${path}`,
    rename: (label) => `Nouveau libellé pour « ${label} » :`,
    editableHint: " ; double-cliquez sur un libellé pour le renommer. ",
  },
  en: {
    library: "Library",
    themes: "Themes",
    subthemes: "Sub-themes",
    label: (model) => `Name the themes with ${model}`,
    refit: "Recompute the themes",
    build: "Analyse",
    building: "Analysing…",
    intro: "Choose a library, then run the analysis. Everything happens on this computer: Zotero reads the library, the models run in Ollama or inside Zotero itself, as set in the preferences.",
    read: ({ n, excluded }) => `${n} references${excluded ? ` (${excluded} set aside)` : ""}`,
    embedding: "Representing the references…",
    embeddingProgress: (done, total) => `Representing the references: ${done}/${total}`,
    themesStep: "Themes…",
    umap: (done, total) => `Projecting the references: ${Math.round((100 * done) / total)}%`,
    attached: (n) => `${n} new references attached to the existing themes`,
    reused: "Themes reused from the previous run",
    paramsChanged: "Parameters changed: the themes are recomputed",
    labelling: ({ model }) => `Names proposed by ${model}…`,
    labellingProgress: (done, total) => `Names proposed by the model: ${done}/${total}`,
    done: (n, seconds) => `${n} references analysed in ${seconds} s`,
    tooFew: (n) => `At least ${MIN_ITEMS} references are needed to find themes (${n} found).`,
    unreachable: (url) => `Ollama does not answer at ${url}. Start the Ollama application, then try again.`,
    missing: (model, available) => `The model “${model}” is not installed in Ollama (available: ${available || "none"}). Install it with “ollama pull ${model}”.`,
    ollamaError: (detail) => `Ollama answered with an error: ${detail}`,
    loadingEngine: (model) => `Loading the model ${model} inside Zotero…`,
    downloading: (file, pct) => `Downloading the model (once): ${file} ${pct}%`,
    export: "Export…",
    exportKinds: {
      private: "Private page (links to Zotero)",
      web: "Web page (charts only)",
      webReferences: "Web page, with the references",
      fragment: "Fragment for a site (charts only)",
      fragmentReferences: "Fragment for a site, with the references",
    },
    exportTitle: "Save the page",
    exported: (path) => `Page saved: ${path}`,
    rename: (label) => `New label for “${label}”:`,
    editableHint: "; double-click a label to rename it. ",
  },
};
const T = UI[lang];

// The shell around the page, when it is exported as a whole document.
const SHELL_STYLE = `html { background: #f9f9f7; }
@media (prefers-color-scheme: dark) { html { background: #0d0d0d; } }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 28px 16px 48px; }`;

const pref = (name) => {
  try {
    return Zotero.Prefs.get(`zoteroArchive.${name}`);
  } catch {
    return undefined;
  }
};

let current = null; // { result, options, store, view, keyToId }
let libraryPicker = null;
let exportPicker = null;

function status(text, error = false) {
  const el = $("za-status");
  el.textContent = text;
  el.classList.toggle("error", error);
}

function explain(error) {
  if (error instanceof TooFewItems) return T.tooFew(error.n);
  if (error instanceof ollama.OllamaError) {
    const [kind, ...rest] = error.message.split(":");
    if (kind === "unreachable") return T.unreachable(rest[0] + ":" + rest[1]);
    if (kind === "missing") return T.missing(rest[0], rest.slice(1).join(":"));
    return T.ollamaError(rest.join(":"));
  }
  return String(error);
}

async function fillLibraries() {
  const libraries = await listLibraries(Zotero);
  const items = libraries.map((lib) => [String(lib.id), `${lib.name} (${lib.nItems})`]);
  libraryPicker = createDropdown({ items, value: items[0]?.[0] ?? "", label: T.library });
  $("za-library").replaceChildren(libraryPicker.element);
  // While developing (scripts/dev.mjs --open-dropdown): show the list at once.
  if (pref("devOpenDropdown") === true) libraryPicker.open();
}

// The page's own period picker, built with the same control.
function pagePicker(items, value, onChange, label) {
  return createDropdown({ items, value, onChange, label }).element;
}

function readOptions() {
  const labelModel = (pref("labelModel") || "").trim();
  const labelLanguage = (pref("labelLanguage") || "").trim();
  const engine = pref("embedEngine") === "local" ? "local" : "ollama";
  return defaultOptions({
    engine,
    nThemes: Math.min(MAX_THEMES, Math.max(2, Number($("za-themes").value) || MAX_THEMES)),
    nSubthemes: Math.max(2, Number($("za-subthemes").value) || 40),
    modelName: engine === "local" ? (pref("localModel") || "").trim() || DEFAULT_LOCAL_MODEL : (pref("embedModel") || "").trim() || DEFAULT_MODEL,
    refit: $("za-refit").checked,
    bulkThreshold: Number(pref("bulkThreshold")) || 100,
    language: lang,
    labelModel: $("za-label").checked && labelModel ? labelModel : null,
    labelLanguage: labelLanguage ? languageKey(labelLanguage) : null,
    ollamaUrl: (pref("ollamaUrl") || "").trim() || ollama.DEFAULT_URL,
  });
}

// ----- analysis -----

async function build() {
  const button = $("za-build");
  button.disabled = true;
  const libraryID = Number(libraryPicker?.value);
  const t0 = Date.now();
  try {
    const options = readOptions();
    status(T.building);
    if (options.engine === "ollama") await ollama.checkModel(options.modelName, options.ollamaUrl);
    if (options.labelModel) await ollama.checkModel(options.labelModel, options.ollamaUrl);

    const { library, items } = await loadItems(Zotero, libraryID);
    const store = createStore(storePath(Zotero, library.id));
    const engine = options.engine === "local" ? await localEngine(options.modelName) : { embed: (texts) => ollama.embed(options.modelName, texts, options.ollamaUrl) };
    const propose = (model, description, language) => proposeLabel(model, description, { url: options.ollamaUrl, language });
    const onStatus = (step, detail) => {
      const text = {
        read: () => T.read(detail),
        embedding: () => T.embedding,
        themes: () => T.themesStep,
        attached: () => T.attached(detail),
        reused: () => T.reused,
        "params-changed": () => T.paramsChanged,
        labelling: () => T.labelling(detail),
      }[step];
      if (text) status(text());
      Zotero.debug(`[zotero-archive] ${step} ${detail === undefined ? "" : JSON.stringify(detail)}`);
    };
    const onProgress = (step, done, total) => {
      const text = { embedding: T.embeddingProgress, umap: T.umap, labelling: T.labellingProgress }[step];
      if (text) status(text(done, total));
      // Let the window repaint between two long steps.
      return new Promise((resolve) => window.setTimeout(resolve, 0));
    };
    let result;
    try {
      result = await run({ library, items, options, store, engine, propose, onStatus, onProgress });
    } finally {
      await engine.dispose?.();
    }
    show(result, options, store);
    status(T.done(result.items.length, ((Date.now() - t0) / 1000).toFixed(1)));
    Zotero.debug(`[zotero-archive] done ${result.items.length} items, ${result.themes.length} themes, ${result.subthemes.length} sub-themes`);
    await devExport();
  } catch (error) {
    status(explain(error), true);
    Zotero.logError(error);
  } finally {
    button.disabled = false;
  }
}

// The in-plugin engine (transformers.js) is a separate bundle, loaded on demand.
async function localEngine(modelName) {
  status(T.loadingEngine(modelName));
  const url = "chrome://zotero-archive/content/engine-local.js";
  const module = await import(url);
  let lastShown = -1;
  return module.createLocalEngine({
    modelName,
    vendorURL: "chrome://zotero-archive/content/vendor/",
    cacheDir: PathUtils.join(Zotero.DataDirectory.dir, "zotero-archive", "models"),
    onProgress: (event) => {
      if (event.status === "progress" && typeof event.progress === "number") {
        const pct = Math.floor(event.progress);
        if (pct === lastShown) return;
        lastShown = pct;
        status(T.downloading(event.file, pct));
        if (pct % 10 === 0) Zotero.debug(`[zotero-archive] engine download ${event.file} ${pct}%`);
      } else if (event.status !== "progress_total") {
        if (event.status === "ready") status(T.loadingEngine(modelName));
        Zotero.debug(`[zotero-archive] engine ${event.status} ${event.file || ""}`);
      }
    },
  });
}

function openInZotero(key) {
  const id = current?.keyToId.get(key);
  if (!id) return;
  const main = Zotero.getMainWindow();
  if (!main) return;
  main.focus();
  main.ZoteroPane.selectItems([id]).catch((error) => Zotero.logError(error));
}

function show(result, options, store) {
  const data = payload({ ...result, options, linkPrefix: selectLink(result.library, "") });
  const host = $("za-page");
  if (current?.view) current.view.destroy();
  // A privileged document sanitises innerHTML and drops form controls, so the
  // markup is parsed as a document of its own and adopted.
  const parsed = new DOMParser().parseFromString(pageMarkup.replace('lang="__LANG__"', `lang="${lang}"`), "text/html");
  const root = document.adoptNode(parsed.querySelector(".zotero-archive"));
  host.replaceChildren(root);
  host.hidden = false;
  $("za-empty").hidden = true;
  $("za-bar-export").hidden = false;
  current = {
    result,
    options,
    store,
    keyToId: new Map(result.items.map((it) => [it.key, it.id])),
    view: renderArchive(root, data, { onOpen: openInZotero, onRename: rename, editableHint: T.editableHint, select: pagePicker }),
  };
}

// ----- renaming a theme or a sub-theme -----

async function rename(kind, id, label) {
  if (!current) return;
  const answer = window.prompt(T.rename(label), label);
  if (answer === null) return;
  const text = answer.trim();
  const entry = current.result.labels.get(labelKey(kind, id));
  entry.text = text || entry.auto;
  try {
    // The label is kept in the themes document, where the next run reads it.
    const doc = (await current.store.readJSON("themes.json")) || { themes: [] };
    for (const t of doc.themes) {
      if (kind === "theme" && t.id === id) t.label = entry.text;
      for (const s of t.subthemes || []) if (kind === "sub" && s.id === id) s.label = entry.text;
    }
    await current.store.writeJSON("themes.json", doc);
  } catch (error) {
    Zotero.logError(error);
  }
  show(current.result, current.options, current.store);
}

// ----- export -----

function escapeHTML(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function assemblePage(kind) {
  const web = kind !== "private";
  const fragment = kind.startsWith("fragment");
  const webReferences = kind.endsWith("References");
  const data = payload({ ...current.result, options: current.options, web, fragment, webReferences, linkPrefix: selectLink(current.result.library, "") });
  // "</" must not appear inside the <script> element that carries the data.
  // Liquid (Jekyll), Jinja and their kin read "{{", "{%" and "{#" as instructions
  // when they render the page a fragment is inserted in; hidden in JSON escapes,
  // the characters come back intact when the page reads its data.
  const json = JSON.stringify(data)
    .replace(/<\//g, "<\\/")
    .replace(/\{\{/g, "{\\u007b")
    .replace(/\{%/g, "{\\u0025")
    .replace(/\{#/g, "{\\u0023");
  const script = await Zotero.File.getResourceAsync("chrome://zotero-archive/content/page.js");
  const body =
    `<!-- zotero-archive:fragment -->\n<style>\n${pageStyle}\n</style>\n` +
    pageMarkup.replace('lang="__LANG__"', `lang="${lang}"`) +
    `\n<script id="za-data" type="application/json">${json}</script>\n<script>\n${script}\n</script>\n<!-- /zotero-archive:fragment -->\n`;
  if (fragment) return body;
  const page = PAGE[lang];
  return (
    `<!doctype html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<meta name="referrer" content="strict-origin-when-cross-origin">\n` +
    `<meta name="description" content="${escapeHTML(page.description)}">\n<title>${escapeHTML(page.title)}</title>\n` +
    `<style>\n${SHELL_STYLE}\n</style>\n</head>\n<body>\n<main>\n${body}</main>\n</body>\n</html>\n`
  );
}

async function exportPage() {
  if (!current) return;
  const kind = exportPicker.value;
  try {
    const html = await assemblePage(kind);
    const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
    const fp = new FilePicker();
    fp.init(window, T.exportTitle, fp.modeSave);
    fp.appendFilter("HTML", "*.html");
    fp.defaultString = kind.startsWith("fragment") ? "zotero-archive-fragment.html" : "zotero-archive.html";
    const rv = await fp.show();
    if (rv !== fp.returnOK && rv !== fp.returnReplace) return;
    const path = fp.file; // Zotero's wrapper returns the path as a string
    await Zotero.File.putContentsAsync(path, html);
    status(T.exported(path));
  } catch (error) {
    status(String(error), true);
    Zotero.logError(error);
  }
}

// While developing (scripts/dev.mjs --export-dir), every export variant is
// written to that folder after each analysis, so that the pages can be checked
// in a browser without going through the file dialog.
async function devExport() {
  const dir = pref("devExportDir");
  if (typeof dir !== "string" || !dir) return;
  try {
    await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
    for (const kind of Object.keys(T.exportKinds)) {
      await IOUtils.writeUTF8(PathUtils.join(dir, `${kind}.html`), await assemblePage(kind));
    }
    Zotero.debug(`[zotero-archive] exports written to ${dir}`);
    const open = pref("devOpenExport");
    if (typeof open === "string" && open) {
      Zotero.openInViewer(PathUtils.toFileURI(PathUtils.join(dir, `${open}.html`)));
    }
  } catch (error) {
    Zotero.logError(error);
  }
}

// ----- the toolbar -----

function setupToolbar() {
  document.documentElement.lang = lang;
  $("za-bar-library-label").textContent = T.library;
  $("za-bar-themes-label").textContent = T.themes;
  $("za-bar-subthemes-label").textContent = T.subthemes;
  $("za-bar-refit-label").textContent = T.refit;
  $("za-build").textContent = T.build;
  $("za-export").textContent = T.export;
  $("za-empty").textContent = T.intro;
  $("za-themes").value = String(Math.min(MAX_THEMES, Number(pref("themes")) || MAX_THEMES));
  $("za-subthemes").value = String(Number(pref("subthemes")) || 40);
  const labelModel = (pref("labelModel") || "").trim();
  $("za-bar-label").hidden = !labelModel;
  if (labelModel) {
    $("za-bar-label-label").textContent = T.label(labelModel);
    $("za-label").checked = true;
  }
  exportPicker = createDropdown({ items: Object.entries(T.exportKinds), value: "private", label: T.export });
  $("za-export-kind").replaceChildren(exportPicker.element);
  $("za-build").addEventListener("click", build);
  $("za-export").addEventListener("click", exportPage);
}

setupToolbar();
fillLibraries()
  .then(() => (pref("devAutoBuild") === true ? build() : undefined))
  .catch((error) => {
    status(String(error), true);
    Zotero.logError(error);
  });
