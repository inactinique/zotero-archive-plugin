// Theme colours: both palettes, for any number of themes the plugin allows.
import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PALETTE, PALETTE_NAMES, PALETTES, paletteColours, paletteCSS } from "../src/lib/palette.js";
import { MAX_THEMES } from "../src/lib/pipeline.js";

const HEX = /^#[0-9a-f]{6}$/i;

test("each palette gives n distinct colours in both schemes, up to the maximum number of themes", () => {
  for (const name of PALETTE_NAMES) {
    assert.ok(PALETTES[name].max >= MAX_THEMES, `${name} covers ${MAX_THEMES} themes`);
    for (let n = 1; n <= MAX_THEMES; n++) {
      const { light, dark } = paletteColours(name, n);
      assert.equal(light.length, n);
      assert.equal(dark.length, n);
      assert.equal(new Set(light).size, n, `${name} ${n} light colours are distinct`);
      assert.equal(new Set(dark).size, n, `${name} ${n} dark colours are distinct`);
      assert.ok([...light, ...dark].every((c) => HEX.test(c)));
    }
  }
});

test("the regular palette keeps the first eight colours of the Python page", () => {
  const { light } = paletteColours("normal", 8);
  assert.deepEqual(light, ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]);
  // Adding themes does not change the colours of the first ones.
  assert.deepEqual(paletteColours("normal", 20).light.slice(0, 8), light);
});

test("the stylesheet sets one variable per theme and an unknown palette falls back", () => {
  const css = paletteCSS("colorblind", 20);
  assert.ok(css.includes("--s20:") && !css.includes("--s21:"));
  assert.ok(css.includes("prefers-color-scheme: dark"));
  assert.ok(css.includes('[data-theme="dark"] .zotero-archive'));
  assert.deepEqual(paletteColours("nonsense", 3), paletteColours(DEFAULT_PALETTE, 3));
  assert.equal(paletteColours("normal", 0).light.length, 1);
});
