// Entry point of the exported, standalone page: read the embedded data and
// render the article. Bundled into content/page.js and inlined at export time.
import { renderArchive } from "./page.js";

const data = JSON.parse(document.getElementById("za-data").textContent);
renderArchive(document.querySelector(".zotero-archive"), data);
