/* global Zotero, Services */
// What the plugin adds to Zotero: a menu item that opens the archive window,
// and a preferences pane. The window itself is content/archive.html.

var ZoteroArchive = {
  id: null,
  version: null,
  rootURI: null,
  windowURL: "chrome://zotero-archive/content/archive.html",
  windowName: "zotero-archive",
  menuItemID: "zotero-archive-menu-open",
  _paneID: null,

  init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    // The archive window reads these to know which plugin opened it.
    Zotero.ZoteroArchive = { id, version, rootURI };
  },

  log(message) {
    Zotero.debug(`[zotero-archive] ${message}`);
  },

  pref(name) {
    try {
      return Zotero.Prefs.get(`zoteroArchive.${name}`);
    } catch {
      return undefined;
    }
  },

  async registerPreferences() {
    this._paneID = await Zotero.PreferencePanes.register({
      pluginID: this.id,
      src: this.rootURI + "content/prefs.xhtml",
      scripts: [this.rootURI + "content/prefs.js"],
      image: this.rootURI + "content/icons/icon.svg",
    });
  },

  unregister() {
    delete Zotero.ZoteroArchive;
  },

  // ----- main window: an entry in the Tools menu -----

  addToWindow(window) {
    const doc = window.document;
    if (doc.getElementById(this.menuItemID)) return;
    window.MozXULElement.insertFTLIfNeeded("zotero-archive.ftl");
    const item = doc.createXULElement("menuitem");
    item.id = this.menuItemID;
    item.setAttribute("data-l10n-id", "zotero-archive-menu-open");
    item.addEventListener("command", () => this.openArchiveWindow());
    const popup = doc.getElementById("menu_ToolsPopup");
    if (popup) popup.append(item);
    // While developing (scripts/dev.mjs), open the archive window at once.
    if (this.pref("devAutoOpen") === true) {
      window.setTimeout(() => this.openArchiveWindow(), 1500);
    }
  },

  removeFromWindow(window) {
    window.document.getElementById(this.menuItemID)?.remove();
  },

  addToAllWindows() {
    for (const window of Zotero.getMainWindows()) {
      if (window.ZoteroPane) this.addToWindow(window);
    }
  },

  removeFromAllWindows() {
    for (const window of Zotero.getMainWindows()) {
      if (window.ZoteroPane) this.removeFromWindow(window);
    }
  },

  // ----- the archive window -----

  openArchiveWindow() {
    const existing = Services.wm.getMostRecentWindow(this.windowName);
    if (existing) {
      existing.focus();
      return existing;
    }
    return Services.ww.openWindow(
      null,
      this.windowURL,
      this.windowName,
      "chrome,resizable,centerscreen,dialog=no,width=1240,height=900",
      null
    );
  },

  closeArchiveWindows() {
    const windows = Services.wm.getEnumerator(this.windowName);
    while (windows.hasMoreElements()) {
      windows.getNext().close();
    }
  },
};
