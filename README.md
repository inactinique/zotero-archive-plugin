# Zotero as your archive · Zotero comme archive — the Zotero plugin

**[English](#english)** · **[Français](#français)**

---

## English

A Zotero library keeps a trace of what caught its owner's attention: every
reference carries the date it was added. This plugin reads a library in the
order of those additions, groups the references into themes, and shows, inside
Zotero, how the themes follow one another over the years.

It is the Zotero plugin version of
[zotero-as-your-archive](https://github.com/inactinique/zotero-as-your-archive),
a Python command. The page it produces is the same; the analysis is the same
recipe, rewritten in JavaScript so that nothing needs to be installed besides
Zotero.

Everything runs on your computer. Zotero reads your library through its own
API; the model that represents your references runs either in
[Ollama](https://ollama.com/) or inside Zotero itself, and the optional model
that names the themes runs in Ollama. No data about your library leaves your
machine.

**Contents**

1. [What you need](#what-you-need)
2. [Installation](#installation)
3. [Use](#use)
4. [Settings](#settings)
5. [Where the results are kept](#where-the-results-are-kept)
6. [What stays private](#what-stays-private)
7. [How it works](#how-it-works)
8. [Developing the plugin](#developing-the-plugin)
9. [Limits](#limits)
10. [Licence](#licence)

### What you need

- **Zotero 7 or later.** The plugin is developed and tested on Zotero 10.
- A library of at least 60 references.
- An **embedding engine**, one of the two:
  - **Ollama**, recommended: a free application that runs language models
    locally. Install it, then fetch the model the analysis uses, the one of the
    Python version
    ([paraphrase-multilingual-mpnet-base-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-mpnet-base-v2),
    563 MB):

    ```sh
    ollama pull paraphrase-multilingual
    ```

  - **Inside Zotero**: nothing to install. The plugin downloads a smaller model
    once (about 120 MB, from the Hugging Face Hub) and runs it in Zotero with
    [transformers.js](https://huggingface.co/docs/transformers.js). It is much
    slower: about 35 minutes for 7,000 references the first time, against
    30 seconds with Ollama; later analyses only embed new references.
- Optionally, an Ollama model to **name** the themes, for example
  `ollama pull qwen3:8b`.

### Installation

1. Download the latest `zotero-archive-<version>.xpi` from the
   [releases](https://github.com/inactinique/zotero-archive-plugin/releases).
2. In Zotero: *Tools › Plugins › ⚙ › Install Plugin From File…*, and choose the file.

To build the plugin from the source instead, see [Developing the plugin](#developing-the-plugin).

### Use

In Zotero, open **Tools › Zotero as your archive…** (start Ollama first if
that is your engine). A window opens with a toolbar:

| Control | Meaning |
| --- | --- |
| Library | your personal library or one of your groups |
| Themes | how many broad themes to compute (2 to 8: beyond that, colours cannot be told apart) |
| Sub-themes | how many fine-grained groups the themes are built from (default 40) |
| Name the themes with … | shown when a naming model is set in the settings: ask that model for the labels |
| Recompute the themes | start from scratch instead of reusing the previous themes |
| Analyse | run the analysis |
| Export… | save the page as a file (see below) |

The first analysis of a library embeds every reference. Later analyses reuse
the vectors, and reuse the themes as well: references already seen keep their
sub-theme, new ones join the nearest sub-theme, so that the page stays
comparable from one run to the next. Themes are only recomputed when you ask
for it, or when an option that defines them changes (model, number of themes
or sub-themes).

The page is the one described, element by element, in the
[README of the Python version](https://github.com/inactinique/zotero-as-your-archive#the-page-element-by-element).
Inside Zotero:

- a **click on a title** in the list of references selects that reference in
  Zotero's main window;
- a **double-click on a theme or sub-theme label** renames it. Your labels are
  kept as long as the themes are not recomputed;
- **Export…** writes a standalone HTML page. Five variants: the *private page*
  (titles link to Zotero, collection names shown), the *web page* (charts only:
  no title, key, link or collection name), the *web page with the references*
  (titles, authors, year, type, and a DOI link when there is one), and the
  same two as a *fragment* (styles, content and script without the document
  shell, to insert in a page of your own site).

### Settings

In *Zotero › Settings › Zotero as your archive*:

| Setting | Default | Meaning |
| --- | --- | --- |
| Ollama address | `http://localhost:11434` | where Ollama answers |
| Embedding engine | Ollama | Ollama, or inside Zotero |
| Model inside Zotero | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | the ONNX model used by the engine inside Zotero (any sentence-embedding model of the Hugging Face Hub converted for transformers.js) |
| Ollama embedding model | `paraphrase-multilingual` | the Ollama model that turns each reference into a vector |
| Model naming the themes | empty | an Ollama model asked to propose a label for each group; empty: labels are the most distinctive words |
| Language of the names | empty | language asked of that model (code or name); empty: the language of the page |

The page follows Zotero's language: French if Zotero is in French, English
otherwise. Changing the embedding engine or its model changes the vectors, so
the themes are recomputed at the next analysis.

### Where the results are kept

In Zotero's data directory, one folder per library:
`<data directory>/zotero-archive/<libraryID>/`.

| File | Content |
| --- | --- |
| `embeddings-<model>.bin`, `embeddings-<model>.json` | the vector of each reference, keyed by a hash of the model and the text; one pair per embedding model |
| `model.json` | the fitted themes: centroids of the sub-themes, their theme, the sub-theme of each reference |
| `themes.json` | the labels, with their automatic proposal and its origin; `themes.json.bak` is the previous one, kept when the themes are recomputed |

The engine inside Zotero keeps its model files in
`<data directory>/zotero-archive/models/`.

To start again from nothing, delete the library's folder. To remove
everything, delete the `zotero-archive` folder and uninstall the plugin; the
Ollama models are removed with `ollama rm <model>`.

### What stays private

| | the window, the private page | web page | web page with the references |
| --- | --- | --- | --- |
| names and distinctive words of the themes | yes | yes | yes |
| date and sub-theme of each addition | yes | yes | yes |
| titles, authors, year, type | yes | no | yes |
| links | to Zotero | none | DOI only |
| Zotero keys, collection names | yes | no | no |
| abstracts, tags, addresses, attachments | no | no | no |

The plugin's files stay in Zotero's data directory and are never part of a
page. The only network connections are those to the Ollama address, on this
computer by default, and, with the engine inside Zotero, the one-time download
of the model from the Hugging Face Hub. Nothing about your library is sent.

### How it works

The same chain as the Python version, in `src/lib/`:

1. **Extraction** (`extract.js`): every regular item of the library (no note,
   attachment or annotation, nothing in the trash, nothing without a title),
   with title, abstract, date added, type, authors, year, DOI, tags and
   collection paths, through the Zotero API.
2. **Representation** (`embed.js`; `ollama.js` or `src/engine/local.js`): title
   and abstract are turned into a vector by the embedding model, in batches;
   vectors are cached.
3. **Sub-themes and themes** (`themes.js`, `kmeans.js`): UMAP
   ([umap-js](https://github.com/PAIR-code/umap-js)) reduces the vectors to
   five dimensions, k-means cuts that space into sub-themes, Ward's criterion
   merges them into themes, and groups are numbered by the median date their
   references were added.
4. **Description**: class-based TF-IDF picks the words and two-word phrases
   that distinguish each group, after removing the function words of seven
   languages ([stopwords-iso](https://github.com/stopwords-iso/stopwords-iso));
   the typical references are the closest to the centre of the group.
5. **Names** (`labels.js`, optional): a model served by Ollama names each group
   from that description.
6. **Page** (`src/page/page.js`): the page of the Python version, which remains
   the reference (see `scripts/sync-template.mjs`).

Random steps use a fixed seed: the same library and the same options give the
same themes. The UMAP implementation differs from the Python one, so the
themes of the plugin and of the Python command are not identical, even when
the embedding model is.

### Developing the plugin

```sh
git clone https://github.com/inactinique/zotero-archive-plugin.git
cd zotero-archive-plugin
npm install
npm test                 # the logic and the page, in Node (no Zotero, no model needed)
npm run build            # build/ : the plugin, loadable from source
npm run build -- --xpi   # also write zotero-archive-<version>.xpi
```

`npm run dev` starts a separate Zotero with the plugin loaded from `build/`,
in a throw-away profile with its own data directory, so that the Zotero you
use every day is never touched:

```sh
npm run dev -- --seed ~/Zotero/zotero.sqlite   # copy your library (references only) on first run
npm run dev -- --autobuild --export-dir /tmp/exports --open-export private
npm run dev -- --engine local --autobuild      # try the engine inside Zotero
npm run dev -- --stop
```

Options: `--home DIR` (where the profile and data live; default
`~/.zotero-archive-dev`), `--autobuild` (analyse the first library as soon as
the window opens), `--export-dir DIR` (write every export variant there after
each analysis), `--open-export KIND` (open one of them in Zotero's viewer),
`--engine local|ollama`, `--zotero PATH` (the Zotero binary). Zotero's debug
output goes to `<home>/zotero.log`.

| Path | Role |
| --- | --- |
| `src/manifest.json`, `src/bootstrap.js`, `src/plugin.js`, `src/prefs.js` | what Zotero loads: lifecycle, menu item, preference pane, default preferences |
| `src/locale/*/zotero-archive.ftl` | the strings of the menu and the preference pane (Fluent) |
| `src/content/archive.html`, `archive.js`, `archive.css` | the window: toolbar, analysis, rename, export |
| `src/content/prefs.xhtml`, `prefs.js` | the preference pane |
| `src/content/page.html`, `page.css` | the page's markup and styles, generated from the Python template |
| `src/page/page.js`, `standalone.js` | the page's script, and the entry point of the exported page |
| `src/lib/` | the analysis, free of any Zotero dependency, tested in `test/` |
| `src/engine/local.js` | the engine inside Zotero (transformers.js), bundled on its own and loaded on demand; the ONNX runtime's WebAssembly files are copied from `node_modules` at build time |
| `scripts/build.mjs`, `dev.mjs`, `sync-template.mjs` | build, development Zotero, refresh of the page from the Python project |

### Limits

- The engine inside Zotero runs on a single WebAssembly thread: slow for a
  large library the first time, fast afterwards since vectors are cached.
- The window and the page are in French or English only; the names proposed by
  a model can be asked for in any language.
- Each reference belongs to one theme only; the grouping depends on the
  options and on the model. It is a proposed reading, to be checked against
  what you know of your own library.

### Licence

GPL-3.0-or-later, like the Python version.

---

## Français

Une bibliothèque Zotero garde la trace de ce qui a retenu l’attention de son
propriétaire : chaque référence porte la date de son ajout. Ce plugin lit une
bibliothèque dans l’ordre de ces ajouts, regroupe les références en thèmes et
montre, dans Zotero, comment les thèmes se succèdent au fil des années.

C’est la version « plugin Zotero » de
[zotero-as-your-archive](https://github.com/inactinique/zotero-as-your-archive),
une commande Python. La page produite est la même ; l’analyse suit la même
recette, réécrite en JavaScript pour qu’il n’y ait rien à installer en dehors
de Zotero.

Tout s’exécute sur votre ordinateur. Zotero lit votre bibliothèque par sa
propre API ; le modèle qui représente vos références tourne soit dans
[Ollama](https://ollama.com/), soit dans Zotero même, et le modèle facultatif
qui nomme les thèmes tourne dans Ollama. Aucune donnée sur votre bibliothèque
ne quitte votre machine.

### Ce qu’il vous faut

- **Zotero 7 ou plus récent.** Le plugin est développé et testé sur Zotero 10.
- Une bibliothèque d’au moins 60 références.
- Un **moteur de représentation**, au choix :
  - **Ollama**, recommandé : une application libre qui fait tourner des
    modèles de langue en local. Installez-la, puis récupérez le modèle de
    l’analyse, celui de la version Python
    ([paraphrase-multilingual-mpnet-base-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-mpnet-base-v2),
    563 Mo) :

    ```sh
    ollama pull paraphrase-multilingual
    ```

  - **Dans Zotero** : rien à installer. Le plugin télécharge une seule fois un
    modèle plus petit (environ 120 Mo, depuis le Hugging Face Hub) et
    l’exécute dans Zotero avec
    [transformers.js](https://huggingface.co/docs/transformers.js). C’est
    beaucoup plus lent : environ 35 minutes pour 7 000 références la première
    fois, contre 30 secondes avec Ollama ; les analyses suivantes ne
    représentent que les nouvelles références.
- Facultativement, un modèle Ollama pour **nommer** les thèmes, par exemple
  `ollama pull qwen3:8b`.

### Installer

1. Téléchargez le dernier `zotero-archive-<version>.xpi` dans les
   [releases](https://github.com/inactinique/zotero-archive-plugin/releases).
2. Dans Zotero : *Outils › Plugins › ⚙ › Install Plugin From File…*, puis choisissez le fichier.

### Utiliser

Dans Zotero, ouvrez **Outils › Zotero comme archive…** (lancez d’abord Ollama
si c’est votre moteur). Une fenêtre s’ouvre, avec une barre d’outils :

| Commande | Sens |
| --- | --- |
| Bibliothèque | votre bibliothèque personnelle ou l’un de vos groupes |
| Thèmes | nombre de grands thèmes (de 2 à 8 : au-delà, les couleurs ne se distinguent plus) |
| Sous-thèmes | nombre de groupes fins dont les thèmes sont faits (40 par défaut) |
| Nommer les thèmes avec … | affiché quand un modèle de nommage est indiqué dans les préférences : lui demander les libellés |
| Recalculer les thèmes | repartir de zéro au lieu de reprendre les thèmes précédents |
| Analyser | lancer l’analyse |
| Exporter… | enregistrer la page dans un fichier (voir plus bas) |

La première analyse d’une bibliothèque représente chaque référence. Les
analyses suivantes reprennent les vecteurs, et reprennent aussi les thèmes :
les références déjà vues gardent leur sous-thème, les nouvelles rejoignent le
sous-thème le plus proche, pour que la page reste comparable d’une fois sur
l’autre. Les thèmes ne sont recalculés qu’à votre demande, ou quand une option
qui les définit change (modèle, nombre de thèmes ou de sous-thèmes).

La page est celle décrite, élément par élément, dans le
[README de la version Python](https://github.com/inactinique/zotero-as-your-archive#la-page-élément-par-élément).
Dans Zotero :

- un **clic sur un titre** de la liste des références sélectionne cette
  référence dans la fenêtre principale de Zotero ;
- un **double-clic sur le libellé d’un thème ou d’un sous-thème** le renomme.
  Vos libellés sont conservés tant que les thèmes ne sont pas recalculés ;
- **Exporter…** écrit une page HTML autonome. Cinq variantes : la *page
  privée* (titres liés à Zotero, noms des collections), la *page pour le web*
  (graphiques seuls : ni titre, ni clé, ni lien, ni nom de collection), la
  *page pour le web avec les références* (titres, auteurs, année, type, et un
  lien DOI quand il existe), et les deux mêmes sous forme de *fragment*
  (styles, contenu et script sans l’enveloppe du document, à insérer dans une
  page de votre site).

### Préférences

Dans *Zotero › Paramètres › Zotero comme archive* :

| Préférence | Défaut | Sens |
| --- | --- | --- |
| Adresse d’Ollama | `http://localhost:11434` | où Ollama répond |
| Moteur de représentation | Ollama | Ollama, ou dans Zotero |
| Modèle dans Zotero | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | le modèle ONNX du moteur intégré (tout modèle de représentation de phrases du Hugging Face Hub converti pour transformers.js) |
| Modèle de représentation d’Ollama | `paraphrase-multilingual` | le modèle Ollama qui transforme chaque référence en vecteur |
| Modèle qui nomme les thèmes | vide | un modèle Ollama à qui demander un libellé pour chaque groupe ; vide : les libellés sont les mots les plus caractéristiques |
| Langue des noms proposés | vide | langue demandée à ce modèle (code ou nom) ; vide : la langue de la page |

La page suit la langue de Zotero : français si Zotero est en français, anglais
sinon. Changer de moteur ou de modèle change les vecteurs : les thèmes sont
recalculés à l’analyse suivante.

### Où sont conservés les résultats

Dans le répertoire de données de Zotero, un dossier par bibliothèque :
`<répertoire de données>/zotero-archive/<identifiant>/` — les vecteurs
(`embeddings-<modèle>.bin` et `.json`, une paire par modèle), les thèmes calculés (`model.json`) et
les libellés (`themes.json`, avec `themes.json.bak`, la version précédente,
conservée quand les thèmes sont recalculés). Le moteur intégré garde ses
fichiers de modèle dans `<répertoire de données>/zotero-archive/models/`.

Pour repartir de zéro, supprimez le dossier de la bibliothèque. Pour tout
effacer, supprimez le dossier `zotero-archive` et désinstallez le plugin ; les
modèles d’Ollama s’enlèvent avec `ollama rm <modèle>`.

### Ce qui reste privé

| | la fenêtre, la page privée | page pour le web | page pour le web avec les références |
| --- | --- | --- | --- |
| noms et mots caractéristiques des thèmes | oui | oui | oui |
| date et sous-thème de chaque ajout | oui | oui | oui |
| titres, auteurs, année, type | oui | non | oui |
| liens | vers Zotero | aucun | DOI seulement |
| clés Zotero, noms des collections | oui | non | non |
| résumés, marqueurs, adresses, fichiers joints | non | non | non |

Les fichiers du plugin restent dans le répertoire de données de Zotero et ne
font jamais partie d’une page. Les seules connexions réseau sont celles vers
l’adresse d’Ollama, sur cet ordinateur par défaut, et, avec le moteur intégré,
le téléchargement unique du modèle depuis le Hugging Face Hub. Rien de votre
bibliothèque n’est envoyé.

### Comment ça marche

La même chaîne que la version Python, dans `src/lib/` : extraction par l’API
de Zotero (`extract.js`), représentation par le modèle, avec un cache
(`embed.js` ; `ollama.js` ou `src/engine/local.js`), UMAP
([umap-js](https://github.com/PAIR-code/umap-js)) puis k-means pour les
sous-thèmes et critère de Ward pour les thèmes, numérotés par date médiane
d’ajout (`themes.js`, `kmeans.js`), TF-IDF par classe pour les mots
caractéristiques, nommage facultatif par un modèle d’Ollama (`labels.js`), et
la page de la version Python (`src/page/page.js`), qui reste la référence
(`scripts/sync-template.mjs` la rafraîchit).

Les étapes aléatoires utilisent une graine fixe : même bibliothèque, mêmes
options, mêmes thèmes. L’implémentation d’UMAP n’est pas celle de Python : les
thèmes du plugin et ceux de la commande Python ne sont donc pas identiques,
même quand le modèle de représentation l’est.

### Développer le plugin

```sh
git clone https://github.com/inactinique/zotero-archive-plugin.git
cd zotero-archive-plugin
npm install
npm test                 # la logique et la page, dans Node (ni Zotero ni modèle nécessaires)
npm run build            # build/ : le plugin, chargeable depuis les sources
npm run build -- --xpi   # écrit aussi zotero-archive-<version>.xpi
npm run dev -- --seed ~/Zotero/zotero.sqlite   # un Zotero de développement, profil et données à part
npm run dev -- --engine local --autobuild      # essayer le moteur intégré
npm run dev -- --stop
```

Les options de `npm run dev` et le rôle de chaque fichier sont décrits dans la
section anglaise ([Developing the plugin](#developing-the-plugin)).

### Limites

- Le moteur intégré à Zotero n’utilise qu’un fil d’exécution WebAssembly :
  lent la première fois sur une grande bibliothèque, rapide ensuite puisque
  les vecteurs sont conservés.
- La fenêtre et la page sont en français ou en anglais seulement ; les noms
  proposés par un modèle peuvent être demandés dans n’importe quelle langue.
- Chaque référence n’appartient qu’à un thème ; le regroupement dépend des
  options et du modèle. C’est une proposition de lecture, à confronter à ce que
  vous savez de votre propre bibliothèque.

### Licence

GPL-3.0-or-later, comme la version Python.
