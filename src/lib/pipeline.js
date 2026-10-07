// The pure parts of the chain: labels, the themes document, and the data
// embedded in the page. Nothing here touches Zotero, files or the network, so
// that it can all be tested in Node.

import { autoLabel } from "./themes.js";
import * as labelling from "./labels.js";
import { DEFAULT_URL } from "./ollama.js";

export const MAX_THEMES = 20; // as many colours as the palettes provide (src/lib/palette.js)
export const MIN_ITEMS = 60;
export const PROJECT_URL = "https://github.com/inactinique/zotero-archive-plugin";
export const PAGE_LANGUAGES = ["fr", "en"];

// Names of the Zotero item types, as shown next to each reference.
export const TYPE_LABELS = {
  fr: {
    journalArticle: "article de revue", newspaperArticle: "article de presse", magazineArticle: "article de magazine",
    book: "livre", bookSection: "chapitre", webpage: "page web", blogPost: "billet de blog",
    conferencePaper: "communication", report: "rapport", preprint: "prépublication", thesis: "thèse",
    document: "document", manuscript: "manuscrit", presentation: "présentation", videoRecording: "vidéo",
    audioRecording: "enregistrement audio", podcast: "podcast", radioBroadcast: "émission de radio",
    tvBroadcast: "émission de télévision", film: "film", letter: "lettre", interview: "entretien",
    encyclopediaArticle: "article d’encyclopédie", dictionaryEntry: "entrée de dictionnaire",
    forumPost: "message de forum", computerProgram: "logiciel", dataset: "jeu de données", map: "carte",
    artwork: "œuvre", statute: "texte de loi", case: "décision de justice", patent: "brevet",
  },
  en: {
    journalArticle: "journal article", newspaperArticle: "newspaper article", magazineArticle: "magazine article",
    book: "book", bookSection: "book chapter", webpage: "web page", blogPost: "blog post",
    conferencePaper: "conference paper", report: "report", preprint: "preprint", thesis: "thesis",
    document: "document", manuscript: "manuscript", presentation: "presentation", videoRecording: "video",
    audioRecording: "audio recording", podcast: "podcast", radioBroadcast: "radio broadcast",
    tvBroadcast: "TV broadcast", film: "film", letter: "letter", interview: "interview",
    encyclopediaArticle: "encyclopedia article", dictionaryEntry: "dictionary entry", forumPost: "forum post",
    computerProgram: "software", dataset: "dataset", map: "map", artwork: "artwork", statute: "statute",
    case: "legal case", patent: "patent",
  },
};

// Title and description of a standalone page, before any script runs.
export const PAGE = {
  fr: { title: "Zotero comme archive", description: "Les thèmes d’une bibliothèque Zotero, suivis au fil des dates d’ajout des références." },
  en: { title: "Zotero as an archive", description: "The themes of a Zotero library, followed along the dates its references were added." },
};

const HELP = {
  fr:
    "Pour renommer un thème ou un sous-thème, modifiez son champ « label » puis relancez l’analyse. " +
    "Vos libellés sont conservés tant que les thèmes ne sont pas recalculés. « auto_label » est la " +
    "proposition automatique, « label_source » son origine et « label_language » la langue demandée " +
    "au modèle : n’y touchez pas.",
  en:
    "To rename a theme or a sub-theme, edit its \"label\" field and run the analysis again. Your labels " +
    "are kept as long as the themes are not recomputed. \"auto_label\" is the automatic proposal, " +
    "\"label_source\" where it comes from and \"label_language\" the language asked of the model: leave them alone.",
};

/** Options of an analysis, with the same defaults as the Python command. */
export function defaultOptions(overrides = {}) {
  return {
    nThemes: MAX_THEMES,
    nSubthemes: 40,
    modelName: "paraphrase-multilingual",
    refit: false,
    exclude: [],
    bulkThreshold: 100,
    name: null, // display name of the library
    language: "fr", // language of the page
    labelModel: null, // Ollama model asked to name the themes
    labelLanguage: null, // language of the names it proposes; null: the page's
    ollamaUrl: DEFAULT_URL,
    ...overrides,
  };
}

export const labelKey = (kind, id) => `${kind}:${id}`;

/**
 * A link anyone can follow: the DOI, when the reference has one.
 *
 * The address stored by Zotero is deliberately not published: it may point
 * to a webmail, an intranet or a shared document, or carry an access token.
 */
export function publicLink(item) {
  const doi = (item.doi || "").replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "");
  if (!doi.startsWith("10.")) return "";
  return "https://doi.org/" + encodeURIComponent(doi).replace(/%2F/g, "/").replace(/%3A/g, ":").replace(/%3B/g, ";").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%2C/g, ",");
}

/** The seconds at which each item was added. */
export function timestamps(items) {
  return items.map((it) => Date.parse(it.dateAdded) / 1000);
}

/** Keep the references of collections whose path does not contain any of the patterns. */
export function excludeCollections(items, patterns) {
  if (!patterns.length) return items;
  const needles = patterns.map((p) => p.toLowerCase());
  return items.filter((it) => !it.collections.some((c) => needles.some((p) => c.toLowerCase().includes(p))));
}

/**
 * A label for every theme and sub-theme.
 *
 * The automatic proposal is the group's most distinctive words, or a name
 * given by a local language model when `labelModel` is set. Names already
 * obtained from a model are reused as long as the themes are, so the model is
 * only called for groups it has not named yet in the requested language.
 * Whatever the proposal, a label rewritten by the user wins.
 *
 * `previous` is the themes document of the last run (or null), `keep` whether
 * its groups are still the same (false after a refit), `propose(model,
 * description, language)` asks the model.
 */
export async function resolveLabels({ previous, themes, subthemes, items, keep, labelModel, labelLanguage, language = "fr", propose, onProgress }) {
  const old = new Map();
  if (previous && keep) {
    for (const t of previous.themes || []) {
      old.set(labelKey("theme", t.id), t);
      for (const s of t.subthemes || []) old.set(labelKey("sub", s.id), s);
    }
  }
  const wanted = labelModel ? `ollama:${labelModel}` : null;
  const askedLanguage = labelLanguage || language;
  const groups = [...themes.map((t) => ["theme", t]), ...subthemes.map((s) => ["sub", s])];
  const proposals = new Map();
  const unnamed = [];
  for (const [kind, group] of groups) {
    const entry = old.get(labelKey(kind, group.id)) || {};
    const source = entry.label_source || "keywords";
    // Names obtained before the language could be chosen were asked for in French.
    const entryLanguage = entry.label_language || labelling.DEFAULT_LANGUAGE;
    if (wanted && (source !== wanted || entryLanguage !== askedLanguage)) {
      unnamed.push([kind, group]);
    } else if (source.startsWith("ollama:") && entry.auto_label) {
      proposals.set(labelKey(kind, group.id), [entry.auto_label, source, entryLanguage]);
    } else {
      proposals.set(labelKey(kind, group.id), [autoLabel(group, language), "keywords", ""]);
    }
  }

  let done = 0;
  for (const [kind, group] of unnamed) {
    await onProgress?.(done, unnamed.length);
    const context =
      kind === "theme"
        ? { parts: group.children.map((s) => subthemes[s]), others: themes.filter((t) => t !== group) }
        : { parent: themes[group.parent], others: themes[group.parent].children.filter((s) => s !== group.id).map((s) => subthemes[s]) };
    const titles = group.exemplars.map((i) => items[i].title);
    const description = labelling.describe(group, titles, { ...context, language: askedLanguage });
    const name = await propose(labelModel, description, askedLanguage);
    // Without a usable answer, keep the words; the model is asked again next time.
    proposals.set(labelKey(kind, group.id), name ? [name, wanted, askedLanguage] : [autoLabel(group, language), "keywords", ""]);
    done++;
  }
  if (unnamed.length) await onProgress?.(done, unnamed.length);

  const labels = new Map();
  for (const [key, [auto, source, lang]] of proposals) {
    const entry = old.get(key) || {};
    const edited = Boolean(entry.label) && entry.label !== entry.auto_label;
    labels.set(key, { text: edited ? entry.label : auto, auto, source, language: lang });
  }
  return labels;
}

/** The themes document: what the user may edit to rename groups. */
export function themesDocument(themes, subthemes, labels, items, language = "fr") {
  const entry = (kind, group) => {
    const label = labels.get(labelKey(kind, group.id));
    return {
      id: group.id,
      label: label.text,
      auto_label: label.auto,
      label_source: label.source,
      ...(label.language ? { label_language: label.language } : {}),
      size: group.size,
      keywords: group.keywords,
      collections: group.collections.map(([name, n]) => `${name} (${n})`),
      exemplars: group.exemplars.map((i) => items[i].title),
    };
  };
  return {
    help: HELP[language] || HELP.en,
    themes: themes.map((t) => ({ ...entry("theme", t), subthemes: t.children.map((s) => entry("sub", subthemes[s])) })),
  };
}

/** Days on which at least `threshold` references were added at once. */
export function bulkDays(items, threshold) {
  const perDay = new Map();
  for (const it of items) {
    const day = it.dateAdded.slice(0, 10);
    perDay.set(day, (perDay.get(day) || 0) + 1);
  }
  return [...perDay].filter(([, n]) => n >= threshold).sort();
}

/**
 * The data embedded in the page.
 *
 * The private page links each reference to Zotero. The web page carries no
 * Zotero key, link or collection name, and lists individual references only
 * on request; it always keeps the date and sub-theme of each addition, which
 * the charts are computed from.
 */
export function payload({ library, items, sub, themes, subthemes, labels, options, web = false, fragment = false, webReferences = false, linkPrefix = "", generated = new Date() }) {
  const lang = options.language;
  if (!PAGE_LANGUAGES.includes(lang)) throw new Error(`unknown page language: ${lang}`);
  const references = webReferences || !web;
  const bulk = bulkDays(items, options.bulkThreshold);
  const bulkSet = new Set(bulk.map(([day]) => day));
  const types = [...new Set(items.map((it) => it.itemType))].sort();
  const typeIndex = new Map(types.map((t, i) => [t, i]));
  const namedBy = [...new Set([...labels.values()].filter((l) => l.source.startsWith("ollama:")).map((l) => l.source.split(":").slice(1).join(":")))].sort();

  const row = (it, k) => {
    const day = it.dateAdded.slice(0, 10);
    const counted = [day, k, bulkSet.has(day) ? 1 : 0];
    if (!references) return ["", "", "", null, 0, ...counted];
    const described = [it.title, it.creators, it.year, typeIndex.get(it.itemType)];
    return web ? ["", ...described, ...counted, publicLink(it)] : [it.key, ...described, ...counted];
  };

  return {
    lang,
    fragment,
    library: options.name || library.name,
    generated: generated.toISOString().slice(0, 10),
    model: options.modelName.split("/").pop(),
    labelModel: namedBy.join(", "),
    project: PROJECT_URL,
    web,
    references,
    linkPrefix: web ? "" : linkPrefix,
    bulkThreshold: options.bulkThreshold,
    bulkDays: bulk,
    types,
    typeLabels: Object.fromEntries(types.filter((t) => TYPE_LABELS[lang][t]).map((t) => [t, TYPE_LABELS[lang][t]])),
    themes: themes.map((t) => ({
      id: t.id,
      label: labels.get(labelKey("theme", t.id)).text,
      keywords: t.keywords,
      collections: web ? [] : t.collections,
      subs: t.children,
    })),
    subthemes: subthemes.map((s) => ({
      id: s.id,
      theme: s.parent,
      label: labels.get(labelKey("sub", s.id)).text,
      keywords: s.keywords,
      collections: web ? [] : s.collections,
    })),
    // One compact row per reference, oldest addition first.
    items: items.map((it, i) => row(it, sub[i])),
  };
}
