/* global Zotero, Services, Components */
// Plugin lifecycle, as Zotero 7+ expects it. The work is done by plugin.js,
// loaded into this scope so that it can be read and tested on its own.

var ZoteroArchive;
var chromeHandle;

function install() {}

function uninstall() {}

async function startup({ id, version, rootURI }) {
  // Serve the files under content/ at chrome://zotero-archive/content/…
  const aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Components.interfaces.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [["content", "zotero-archive", "content/"]]);

  Services.scriptloader.loadSubScript(rootURI + "plugin.js");
  ZoteroArchive.init({ id, version, rootURI });
  await ZoteroArchive.registerPreferences();
  ZoteroArchive.addToAllWindows();
}

function onMainWindowLoad({ window }) {
  ZoteroArchive.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  ZoteroArchive.removeFromWindow(window);
}

function shutdown() {
  if (ZoteroArchive) {
    ZoteroArchive.removeFromAllWindows();
    ZoteroArchive.closeArchiveWindows();
    ZoteroArchive.unregister();
    ZoteroArchive = undefined;
  }
  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}
