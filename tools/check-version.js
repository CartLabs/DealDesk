// Fails if the version in index.html and version.json disagree.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const app = (fs.readFileSync(path.join(root, "index.html"), "utf8").match(/APP_VERSION = '([^']+)'/) || [])[1];
const ver = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")).version;
if (!app || app !== ver) { console.error(`Version mismatch: index.html ${app}, version.json ${ver}`); process.exit(1); }
console.log("Version " + ver + " matches in index.html and version.json");
