// Generates the installer's legal files from the single source in legal/:
//   build/license.txt              - Terms of Service shown on the installer's license page
//   build/THIRD-PARTY-NOTICES.txt  - licenses of the open-source code bundled into the app
// Usage: node scripts/make-legal.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { legalToPlainText } from '../src/core/legal.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build');
mkdirSync(out, { recursive: true });

// The NSIS license page is a Windows rich-edit control: CRLF line endings, UTF-8 with BOM, and
// plain punctuation so it reads the same on every code page.
const ASCII = { '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u00a9': '(c)', '\u2192': '->', '\u2026': '...', '\u00a0': ' ' };
const windowsText = (s) => '\ufeff' + s.replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u00a9\u2192\u2026\u00a0]/g, (c) => ASCII[c]).replace(/\r?\n/g, '\r\n');

const terms = legalToPlainText(readFileSync(join(root, 'legal', 'terms-of-service.md'), 'utf8'));
writeFileSync(join(out, 'license.txt'), windowsText(terms));

// Packages bundled into dist/ by Vite (runtime dependencies and everything they pull in).
const BUNDLED = ['react', 'react-dom', 'zustand', 'lucide-react', 'pdfjs-dist', 'pdf-lib'];
const seen = new Map();
// Node's module lookup: the nearest node_modules/<name> walking up from the dependent package.
const findPackage = (name, from) => {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dirname(dir) === dir) throw new Error(`Cannot find ${name} from ${from}`);
  }
};
const visit = (name, from) => {
  if (seen.has(name)) return;
  const dir = findPackage(name, from);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  seen.set(name, { pkg, dir });
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir);
};
BUNDLED.forEach((n) => visit(n, root));

const sections = [...seen.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, { pkg, dir }]) => {
    const files = readdirSync(dir).filter((f) => /^(licen[cs]e|copying|notice)/i.test(f));
    const text = files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n') || `Licensed under ${pkg.license}.`;
    return `${'='.repeat(78)}\n${name} ${pkg.version} (${pkg.license})\n${pkg.homepage ?? ''}\n${'='.repeat(78)}\n\n${text}\n`;
  });

const header = [
  'BuildSuite Takeoff Studio - Third-Party Notices',
  '',
  'BuildSuite Takeoff Studio includes the open-source software listed below. Each component is',
  'licensed under its own terms, reproduced here. The Electron runtime and Chromium are distributed',
  'with the application; their licenses are in LICENSE.electron.txt and LICENSES.chromium.html in',
  'the installation folder.',
  '',
  'Bluebeam and Revu are trademarks of Bluebeam, Inc. BuildSuite is not affiliated with Bluebeam, Inc.',
  '',
].join('\n');
writeFileSync(join(out, 'THIRD-PARTY-NOTICES.txt'), windowsText(header + '\n' + sections.join('\n')));

console.log(`Wrote build/license.txt and build/THIRD-PARTY-NOTICES.txt (${seen.size} packages)`);
