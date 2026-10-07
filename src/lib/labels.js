// Name themes with a language model served locally by Ollama.
//
// The words picked by class-based TF-IDF describe a group without naming it. A
// small local model, given those words and a few typical titles, proposes a
// short label. The model is queried through Ollama's HTTP API on this machine,
// so the library still does not leave it.

import { DEFAULT_URL, ollamaCall } from "./ollama.js";

export const DEFAULT_LANGUAGE = "fr";
export const MAX_LENGTH = 80;

// Languages that can be asked for by code. Any other value is handed to the
// model as it was written ("Polish", "Luxembourgish"...).
export const LANGUAGES = {
  fr: "French",
  en: "English",
  de: "German",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
};
const ALIASES = {
  "français": "fr", "francais": "fr",
  "anglais": "en",
  "allemand": "de", "deutsch": "de",
  "espagnol": "es", "español": "es",
  "italien": "it", "italiano": "it",
  "néerlandais": "nl", "nederlands": "nl",
  "portugais": "pt", "português": "pt",
};
for (const [code, name] of Object.entries(LANGUAGES)) ALIASES[name.toLowerCase()] = code;

// French, the language of most libraries this was written for, has its own
// prompt: asked in French, a small model writes better French labels.
export const SYSTEM_FR =
  "Tu aides un chercheur à nommer les thèmes de sa bibliothèque de références bibliographiques. " +
  "Pour le groupe de références décrit, propose un libellé court (2 à 6 mots) en français, précis " +
  "et informatif, comme un intitulé de rayon de bibliothèque. Pas de guillemets, pas de point " +
  "final, pas de formule vague comme « divers » ou « recherche ».";
// For any other language the prompt is in English, and insists on the target
// language: small models otherwise slip into the language of the titles.
export const SYSTEM_OTHER =
  "You help a researcher name the themes of their library of bibliographic references. " +
  "For the group of references described, propose a short label (2 to 6 words) in {language}, " +
  "precise and informative, like the heading of a library shelf. No quotation marks, no final " +
  "period, no list of words separated by commas, no vague wording such as \"miscellaneous\" or " +
  "\"research\". The words and titles you are given may be in other languages: do not copy " +
  "them, write the label in {language}.";

const PHRASES = {
  fr: {
    group: "Groupe de {n} références.",
    words: "Mots caractéristiques : {words}.",
    parent: "Ce groupe fait partie d’un thème plus large : {words}.",
    parts: "Sous-ensembles (nombre de références, mots) :",
    part: "- {n} : {words}",
    collections: "Collections Zotero les plus présentes : {names}.",
    titles: "Titres représentatifs :",
    others: "Autres groupes voisins, à ne pas confondre avec celui-ci : {names}.",
  },
  other: {
    group: "Group of {n} references.",
    words: "Distinctive words: {words}.",
    parent: "This group belongs to a broader theme: {words}.",
    parts: "Subsets (number of references, words):",
    part: "- {n}: {words}",
    collections: "Most frequent Zotero collections: {names}.",
    titles: "Typical titles:",
    others: "Neighbouring groups, not to be confused with this one: {names}.",
    reminder: "\nLabel for this group, in {language}:",
  },
};

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, k) => String(values[k]));

/** Normalise a requested language: "EN", "English" and "anglais" all give "en". */
export function languageKey(value) {
  const key = value.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
  if (!key) throw new Error("empty language");
  return key in LANGUAGES ? key : ALIASES[key] || key;
}

/** The name given to the model: "English" for "en", the value itself if unknown. */
export function languageName(key) {
  return LANGUAGES[key] || key;
}

/**
 * The description of a group handed to the model.
 *
 * `parts` are the sub-themes of a theme, `parent` the theme of a sub-theme,
 * and `others` the neighbouring groups it must not be confused with.
 */
export function describe(group, titles, { parts = [], parent = null, others = [], language = DEFAULT_LANGUAGE } = {}) {
  const say = PHRASES[language === "fr" ? "fr" : "other"];
  const lines = [fill(say.group, { n: group.size }), fill(say.words, { words: group.keywords.join(", ") })];
  if (parent) lines.push(fill(say.parent, { words: parent.keywords.slice(0, 6).join(", ") }));
  if (parts.length) {
    lines.push(say.parts);
    for (const p of parts) lines.push(fill(say.part, { n: p.size, words: p.keywords.slice(0, 6).join(", ") }));
  }
  if (group.collections.length) {
    const names = group.collections.slice(0, 4).map(([name, n]) => `${name} (${n})`).join(" ; ");
    lines.push(fill(say.collections, { names }));
  }
  lines.push(say.titles);
  for (const title of titles) lines.push(`- ${title.slice(0, 140)}`);
  if (others.length) {
    const names = others.map((o) => o.keywords.slice(0, 3).join(", ")).join(" | ");
    lines.push(fill(say.others, { names }));
  }
  if (say.reminder) lines.push(fill(say.reminder, { language: languageName(language) }));
  return lines.join("\n");
}

/** Tidy a proposed label: one line, no quotes, no final period, a capital first. */
export function clean(label) {
  let s = label.replace(/\s+/g, " ").trim();
  s = s.replace(/^["'«»“”‘’ ]+|["'«»“”‘’ ]+$/g, "").replace(/\.+$/, "").trim();
  return (s.slice(0, 1).toUpperCase() + s.slice(1, MAX_LENGTH)).replace(/\s+$/, "");
}

/** The JSON field the model must fill: naming the language in it helps it comply. */
export function answerField(language) {
  if (language === "fr") return "label";
  const plain = languageName(language).normalize("NFKD").replace(/[^\x00-\x7f]/g, "");
  const slug = plain.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  return slug ? `label_in_${slug}` : "label";
}

/** Ask the model for a label; an empty string means it gave nothing usable. */
export async function propose(model, description, { url = DEFAULT_URL, language = DEFAULT_LANGUAGE, call = ollamaCall } = {}) {
  const field = answerField(language);
  const system = language === "fr" ? SYSTEM_FR : fill(SYSTEM_OTHER, { language: languageName(language) });
  const answer = await call(url, "/api/chat", {
    model,
    stream: false,
    think: false, // a label does not need a reasoning phase
    format: { type: "object", properties: { [field]: { type: "string" } }, required: [field] },
    options: { temperature: 0, seed: 42 }, // same library, same labels
    messages: [
      { role: "system", content: system },
      { role: "user", content: description },
    ],
  });
  try {
    const value = JSON.parse(answer.message.content)[field];
    if (typeof value !== "string") return "";
    return clean(value);
  } catch {
    return "";
  }
}
