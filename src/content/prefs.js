/* global window */
// The preferences pane binds its fields to the preferences through the
// `preference` attribute; nothing else is needed beyond loading the strings.
var ZoteroArchivePrefs = {
  init() {
    window.MozXULElement.insertFTLIfNeeded("zotero-archive.ftl");
  },
};
