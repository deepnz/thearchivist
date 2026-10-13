// Builds the page for publishing as a Claude artifact.
// The artifact platform wraps the page in its own <html>/<head>/<body>, so this
// takes only the content between the artifact:start / artifact:end markers in
// index.html and inlines the stylesheet. The JS modules are published
// alongside the page as separate files (see README).
// Run: node scripts/build-artifact.mjs [out-file]   (default: dist/artifact.html)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? `${root}/dist/artifact.html`);

const html = readFileSync(`${root}/index.html`, 'utf8');
const start = html.indexOf('<!-- artifact:start -->');
const end = html.indexOf('<!-- artifact:end -->');
if (start === -1 || end === -1) throw new Error('index.html is missing the artifact markers');

let page = html.slice(start + '<!-- artifact:start -->'.length, end);
// Drop the head/body boundary between the markers.
page = page.replace(/<!-- artifact:head-end -->\s*<\/head>\s*<body>/, '');
const css = readFileSync(`${root}/css/styles.css`, 'utf8');
page = page.replace('<link rel="stylesheet" href="css/styles.css">', `<style>\n${css}\n</style>`);

if (/<\/?(html|head|body)\b/i.test(page)) throw new Error('artifact page still contains document tags');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page.trimStart());
console.log(`${out} (${(page.length / 1024).toFixed(1)} KB)`);
