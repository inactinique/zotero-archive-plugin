// A dropdown made of ordinary elements.
//
// Native <select> popups do not work in a privileged top-level HTML window:
// Firefox draws them through the window's parent <browser> element, which such
// a window does not have, so the list comes out unreadable and inert. This
// control is a button and a list, usable with the mouse and the keyboard, and
// styled by archive.css. `items` are [value, label] pairs.

export function createDropdown({ items, value, onChange, label, doc = document }) {
  const root = doc.createElement("span");
  root.className = "za-dropdown";
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "za-dropdown-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  if (label) button.setAttribute("aria-label", label);
  const text = doc.createElement("span");
  text.className = "za-dropdown-text";
  const caret = doc.createElement("span");
  caret.className = "za-dropdown-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "▾";
  button.append(text, caret);
  const list = doc.createElement("ul");
  list.className = "za-dropdown-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  let current = value;
  let active = -1;
  const entries = items.map(([v, l], i) => {
    const li = doc.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.value = v;
    li.textContent = l;
    li.addEventListener("click", (event) => {
      event.stopPropagation();
      choose(i);
    });
    li.addEventListener("mousemove", () => highlight(i));
    list.append(li);
    return li;
  });

  function sync() {
    const i = items.findIndex(([v]) => v === current);
    text.textContent = i >= 0 ? items[i][1] : "";
    entries.forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
  }
  function highlight(i) {
    active = i;
    entries.forEach((li, j) => li.classList.toggle("active", j === i));
    if (i >= 0) entries[i].scrollIntoView?.({ block: "nearest" });
  }
  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    highlight(Math.max(0, items.findIndex(([v]) => v === current)));
    doc.addEventListener("mousedown", onOutside, true);
    doc.addEventListener("keydown", onKey, true);
  }
  function close() {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    doc.removeEventListener("mousedown", onOutside, true);
    doc.removeEventListener("keydown", onKey, true);
  }
  function choose(i) {
    const changed = items[i][0] !== current;
    current = items[i][0];
    sync();
    close();
    button.focus();
    if (changed) onChange?.(current);
  }
  function onOutside(event) {
    if (!root.contains(event.target)) close();
  }
  function onKey(event) {
    switch (event.key) {
      case "Escape":
        close();
        button.focus();
        break;
      case "ArrowDown":
        highlight(Math.min(items.length - 1, active + 1));
        break;
      case "ArrowUp":
        highlight(Math.max(0, active - 1));
        break;
      case "Home":
        highlight(0);
        break;
      case "End":
        highlight(items.length - 1);
        break;
      case "Enter":
      case " ":
        if (active >= 0) choose(active);
        break;
      case "Tab":
        close();
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  button.addEventListener("click", () => (list.hidden ? open() : close()));
  button.addEventListener("keydown", (event) => {
    if (list.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      open();
    }
  });
  root.append(button, list);
  sync();

  return {
    element: root,
    get value() {
      return current;
    },
    set value(v) {
      current = v;
      sync();
    },
    open,
    close,
  };
}
