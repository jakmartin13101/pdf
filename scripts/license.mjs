#!/usr/bin/env node
// License keys for BuildSuite Takeoff Studio: make the signing key pair, issue license keys, check them.
//
//   node scripts/license.mjs keygen [--out license]           a new key pair: the private key stays in --out
//                                                            (never commit it); the public key is printed
//   node scripts/license.mjs issue --tier pro|basic --name "Customer" [--company "…"] [--email "…"]
//                                  [--expires YYYY-MM-DD] [--key license/private-key.jwk.json] [--file out.bslicense]
//   node scripts/license.mjs verify <license key> [--public public.jwk.json]
//
// The private key is read from --key, else the LICENSE_PRIVATE_KEY environment variable (the JWK as JSON,
// e.g. a GitHub Actions secret), else license/private-key.jwk.json. Keys are ECDSA P-256 signatures over
// the license details, checked offline by the program with the public key in src/core/licenseKeys.ts.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto as crypto } from 'node:crypto';

const PREFIX = 'BSTS1';
const PRODUCT = 'takeoff-studio';
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const b64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    } else out._.push(a);
  }
  return out;
}

function fail(msg) {
  console.error(`license: ${msg}`);
  process.exit(1);
}

async function keygen(o) {
  const dir = join(root, o.out ?? 'license');
  const file = join(dir, 'private-key.jwk.json');
  if (existsSync(file) && o.force !== 'true') fail(`${file} exists (--force to replace it; licenses signed with it would stop working)`);
  const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(priv, null, 2) + '\n', { mode: 0o600 });
  writeFileSync(join(dir, 'public-key.jwk.json'), JSON.stringify(pub, null, 2) + '\n');
  console.log(`Private key: ${file} (keep it secret, never commit it)`);
  console.log(`Public key (put it in src/core/licenseKeys.ts):\n${JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y })}`);
}

function privateKeyJwk(o) {
  if (o.key) return JSON.parse(readFileSync(o.key, 'utf8'));
  if (process.env.LICENSE_PRIVATE_KEY) return JSON.parse(process.env.LICENSE_PRIVATE_KEY);
  const file = join(root, 'license', 'private-key.jwk.json');
  if (!existsSync(file)) fail('no private key: --key <file>, LICENSE_PRIVATE_KEY, or license/private-key.jwk.json (npm run license -- keygen)');
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function issue(o) {
  const tier = (o.tier ?? '').toLowerCase();
  if (tier !== 'pro' && tier !== 'basic') fail('--tier pro or --tier basic');
  const name = (o.name ?? '').trim();
  if (!name || name === 'true') fail('--name "Licensed to"');
  if (o.expires && !/^\d{4}-\d{2}-\d{2}$/.test(o.expires)) fail('--expires YYYY-MM-DD');
  const info = {
    v: 1,
    product: PRODUCT,
    tier,
    name,
    ...(o.company && o.company !== 'true' ? { company: o.company.trim() } : {}),
    ...(o.email && o.email !== 'true' ? { email: o.email.trim() } : {}),
    issued: new Date().toISOString().slice(0, 10),
    ...(o.expires ? { expires: o.expires } : {}),
    id: b64url(crypto.getRandomValues(new Uint8Array(9))),
  };
  const key = await crypto.subtle.importKey('jwk', privateKeyJwk(o), ALG, false, ['sign']);
  const payload = new TextEncoder().encode(JSON.stringify(info));
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN, key, payload));
  const license = `${PREFIX}.${b64url(payload)}.${b64url(sig)}`;
  if (o.file) writeFileSync(o.file, license + '\n');
  console.log(license);
  return license;
}

async function verify(o) {
  const license = (o._[1] ?? '').replace(/\s+/g, '');
  const [prefix, p, s] = license.split('.');
  if (prefix !== PREFIX || !p || !s) fail('not a license key');
  const pubFile = o.public ?? join(root, 'license', 'public-key.jwk.json');
  const pub = JSON.parse(readFileSync(pubFile, 'utf8'));
  const key = await crypto.subtle.importKey('jwk', pub, ALG, false, ['verify']);
  const ok = await crypto.subtle.verify(SIGN, key, fromB64url(s), fromB64url(p));
  const info = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  console.log(ok ? 'Valid signature' : 'INVALID signature', JSON.stringify(info, null, 2));
  if (!ok) process.exit(2);
}

const o = args(process.argv.slice(2));
const cmd = o._[0];
if (cmd === 'keygen') await keygen(o);
else if (cmd === 'issue') await issue(o);
else if (cmd === 'verify') await verify(o);
else fail('keygen | issue | verify (see the top of scripts/license.mjs)');
