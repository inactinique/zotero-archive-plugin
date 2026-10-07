// Colours of the themes.
//
// Themes are numbered chronologically, so a palette is an ordered list: theme
// i gets colour i. The page (page.js) reads the colours from the CSS variables
// --s1, --s2, … of the .zotero-archive element; `paletteCSS` writes those
// variables for the palette and the number of themes in use, in both colour
// schemes, and overrides the eight colours the page's stylesheet defines.

export const DEFAULT_PALETTE = "normal";
export const PALETTE_NAMES = ["normal", "colorblind"];

// The regular palette: the eight colours of the Python version, then twelve
// more, chosen for hue and lightness contrast (several come from Kelly's
// colours of maximum contrast). Dark variants are lightened where the light
// ones would sink into a dark background.
const NORMAL = {
  light: [
    "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948",
    "#17becf", "#8c564b", "#b3446c", "#848482", "#8db600", "#003f8a", "#c2b280", "#dcd300",
    "#a1caf1", "#604e97", "#f99379", "#654522",
  ],
  dark: [
    "#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767",
    "#22c3d3", "#a9786b", "#c85a82", "#9a9a98", "#9ccc1f", "#5a7fa8", "#cdbf8f", "#e0d93a",
    "#a9cff3", "#7b68b5", "#f99379", "#8b6a3e",
  ],
};

// Paul Tol's discrete rainbow scheme (https://personal.sron.nl/~pault/),
// designed to stay distinguishable with colour-vision deficiency. For n
// colours, Tol recommends a particular subset of the 29, listed below; the
// order runs from purple to red, which here reads as old to recent.
const TOL_RAINBOW = [
  "#E8ECFB", "#D9CCE3", "#D1BBD7", "#CAACCB", "#BA8DB4", "#AE76A3", "#AA6F9E", "#994F88", "#882E72",
  "#1965B0", "#437DBF", "#5289C7", "#6195CF", "#7BAFDE", "#4EB265", "#90C987", "#CAE0AB", "#F7F056",
  "#F7CB45", "#F6C141", "#F4A736", "#F1932D", "#EE8026", "#E8601C", "#E65518", "#DC050C", "#A5170E",
  "#72190E", "#42150A",
];
const TOL_SUBSETS = {
  1: [10],
  2: [10, 26],
  3: [10, 18, 26],
  4: [10, 15, 18, 26],
  5: [10, 14, 15, 18, 26],
  6: [10, 14, 15, 17, 18, 26],
  7: [9, 10, 14, 15, 17, 18, 26],
  8: [9, 10, 14, 15, 17, 18, 23, 26],
  9: [9, 10, 14, 15, 17, 18, 23, 26, 28],
  10: [9, 10, 14, 15, 17, 18, 21, 24, 26, 28],
  11: [9, 10, 12, 14, 15, 17, 18, 21, 24, 26, 28],
  12: [3, 6, 9, 10, 12, 14, 15, 17, 18, 21, 24, 26],
  13: [3, 6, 9, 10, 12, 14, 15, 16, 17, 18, 21, 24, 26],
  14: [3, 6, 9, 10, 12, 14, 15, 16, 17, 18, 20, 22, 24, 26],
  15: [3, 6, 9, 10, 12, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28],
  16: [3, 5, 7, 9, 10, 12, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28],
  17: [3, 5, 7, 8, 9, 10, 12, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28],
  18: [3, 5, 7, 8, 9, 10, 12, 14, 15, 16, 17, 18, 20, 22, 24, 26, 27, 28],
  19: [2, 4, 5, 7, 8, 9, 10, 12, 14, 15, 16, 17, 18, 20, 22, 24, 26, 27, 28],
  20: [2, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 27, 28],
  21: [2, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 26, 27, 28],
  22: [2, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 26, 27, 28],
  23: [1, 2, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 26, 27, 28],
};

export const PALETTES = {
  normal: {
    max: NORMAL.light.length,
    colours(n) {
      const k = Math.min(n, NORMAL.light.length);
      return { light: NORMAL.light.slice(0, k), dark: NORMAL.dark.slice(0, k) };
    },
  },
  colorblind: {
    max: 23,
    colours(n) {
      const k = Math.min(n, 23);
      const chosen = TOL_SUBSETS[k].map((i) => TOL_RAINBOW[i - 1]);
      return { light: chosen, dark: chosen };
    },
  },
};

/** The colours of `n` themes, in both colour schemes, for a palette name. */
export function paletteColours(name, n) {
  const palette = PALETTES[name] || PALETTES[DEFAULT_PALETTE];
  return palette.colours(Math.max(1, Math.floor(n) || 1));
}

/** A stylesheet setting --s1 … --sn on the page's root element. */
export function paletteCSS(name, n) {
  const { light, dark } = paletteColours(name, n);
  const vars = (list) => list.map((c, i) => `--s${i + 1}: ${c};`).join(" ");
  return [
    `.zotero-archive { ${vars(light)} }`,
    `[data-theme="dark"] .zotero-archive { ${vars(dark)} }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .zotero-archive { ${vars(dark)} } }`,
  ].join("\n");
}
