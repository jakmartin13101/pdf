// Builds a self-contained bundle for publishing as a claude.ai Artifact:
//   dist-artifact/takeoff-studio.html   page content (title, inlined CSS, root, module script)
//   dist-artifact/assets/app.js         application bundle
//   dist-artifact/assets/pdf.worker.js  pdf.js worker
//   dist-artifact/samples/*             sample drawing set and example takeoff
// The published build opens straight into the example takeoff (VITE_OPEN_EXAMPLE=1).
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-artifact');

execSync('npx vite build --outDir dist-artifact --emptyOutDir', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_OPEN_EXAMPLE: '1' },
});

const assetsDir = join(out, 'assets');
const files = readdirSync(assetsDir);
const js = files.find((f) => /^index-.*\.js$/.test(f));
const css = files.find((f) => /^index-.*\.css$/.test(f));
const worker = files.find((f) => /^pdf\.worker.*\.mjs$/.test(f));
if (!js || !css || !worker) throw new Error(`Unexpected build output: ${files.join(', ')}`);

// The publisher refuses raw control characters and literal U+FFFD. In these bundles both only occur
// inside string literals (pdf.js and pdf-lib font tables), where a \xNN / \uFFFD escape is equivalent.
function escapeControlChars(code, name) {
  return code.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/g, (ch, offset) => {
    if (code[offset - 1] === '\\') throw new Error(`Cannot escape character after a backslash in ${name}`);
    const cp = ch.charCodeAt(0);
    return cp > 0xff ? '\\u' + cp.toString(16).toUpperCase().padStart(4, '0') : '\\x' + cp.toString(16).padStart(2, '0');
  });
}

let app = escapeControlChars(readFileSync(join(assetsDir, js), 'utf8'), js);
if (!app.includes(worker)) throw new Error('Worker reference not found in bundle');
app = app.split(worker).join('pdf.worker.js');
writeFileSync(join(assetsDir, 'app.js'), app);
rmSync(join(assetsDir, js));
writeFileSync(join(assetsDir, 'pdf.worker.js'), escapeControlChars(readFileSync(join(assetsDir, worker), 'utf8'), worker));
rmSync(join(assetsDir, worker));

const styles = readFileSync(join(assetsDir, css), 'utf8');
rmSync(join(assetsDir, css));
rmSync(join(out, 'index.html'));
rmSync(join(out, 'favicon.svg'), { force: true });

// Artifact pages are wrapped in their own document skeleton, so this is page content only.
const page = `<title>Takeoff Studio</title>
<style>
${styles}
</style>
<div id="root"></div>
<script type="module" src="assets/app.js"></script>
`;
writeFileSync(join(out, 'takeoff-studio.html'), page);
console.log('Artifact bundle ready in dist-artifact/');
