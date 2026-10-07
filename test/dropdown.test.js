// The dropdown control used in the window instead of native <select> popups.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createDropdown } from "../src/content/dropdown.js";

function setup() {
  const { window } = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
  const doc = window.document;
  const picked = [];
  const dropdown = createDropdown({
    doc,
    items: [["a", "Alpha"], ["b", "Beta"], ["c", "Gamma"]],
    value: "b",
    onChange: (v) => picked.push(v),
    label: "Letter",
  });
  doc.body.append(dropdown.element);
  const button = dropdown.element.querySelector("button");
  const list = dropdown.element.querySelector("ul");
  const click = (el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const key = (k) => doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }));
  return { window, doc, dropdown, picked, button, list, click, key };
}

test("shows the current value, opens on click and selects with the mouse", () => {
  const { dropdown, picked, button, list, click } = setup();
  assert.equal(button.textContent.trim(), "Beta▾");
  assert.equal(button.getAttribute("aria-label"), "Letter");
  assert.ok(list.hidden);
  click(button);
  assert.ok(!list.hidden);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.deepEqual([...list.children].map((li) => li.getAttribute("aria-selected")), ["false", "true", "false"]);
  click(list.children[2]);
  assert.ok(list.hidden);
  assert.equal(dropdown.value, "c");
  assert.deepEqual(picked, ["c"]);
  assert.equal(button.textContent.trim(), "Gamma▾");
});

test("is usable with the keyboard and closes on Escape or an outside click", () => {
  const { window, doc, dropdown, picked, button, list, click, key } = setup();
  click(button);
  key("ArrowUp"); // from Beta to Alpha
  assert.ok(list.children[0].classList.contains("active"));
  key("Enter");
  assert.ok(list.hidden);
  assert.equal(dropdown.value, "a");
  assert.deepEqual(picked, ["a"]);

  click(button);
  key("Escape");
  assert.ok(list.hidden);
  click(button);
  doc.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
  assert.ok(list.hidden);
  // Choosing the current value again changes nothing.
  click(button);
  click(list.children[0]);
  assert.deepEqual(picked, ["a"]);
  dropdown.value = "b";
  assert.equal(button.textContent.trim(), "Beta▾");
});
