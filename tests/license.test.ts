import { describe, expect, it } from 'vitest';
import { FEATURES, LICENSE_PREFIX, hasFeature, readLicense, tierOf, verifyLicense, type LicenseInfo } from '../src/core/license';

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function keyPair() {
  const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  return { priv: pair.privateKey, pub: await crypto.subtle.exportKey('jwk', pair.publicKey) };
}

/** A license key as scripts/license.mjs makes them. */
async function issue(priv: CryptoKey, patch: Partial<LicenseInfo> = {}) {
  const info: LicenseInfo = { v: 1, product: 'takeoff-studio', tier: 'pro', name: 'Test Estimator', issued: '2026-10-21', id: 'abc', ...patch };
  const payload = new TextEncoder().encode(JSON.stringify(info));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, payload));
  return `${LICENSE_PREFIX}.${b64url(payload)}.${b64url(sig)}`;
}

describe('license keys', () => {
  it('a key signed with a trusted key gives its tier', async () => {
    const { priv, pub } = await keyPair();
    const pro = await verifyLicense(await issue(priv), [pub]);
    expect(pro.state).toBe('valid');
    expect(tierOf(pro)).toBe('pro');
    expect(hasFeature(pro, 'combine')).toBe(true);
    expect(hasFeature(pro, 'autoTakeoff')).toBe(true);
    const basic = await verifyLicense(await issue(priv, { tier: 'basic' }), [pub]);
    expect(tierOf(basic)).toBe('basic');
    expect(hasFeature(basic, 'combine')).toBe(false);
    expect(hasFeature(basic, 'autoTakeoff')).toBe(false);
    // Pasted with line breaks and spaces.
    const key = await issue(priv);
    expect((await verifyLicense(`  ${key.slice(0, 40)}\n${key.slice(40)} `, [pub])).state).toBe('valid');
  });

  it('without a license, or with one that is not genuine, the Basic features', async () => {
    const { priv, pub } = await keyPair();
    const none = await verifyLicense('', [pub]);
    expect(none.state).toBe('none');
    expect(tierOf(none)).toBe('basic');
    expect((await verifyLicense('hello', [pub])).state).toBe('invalid');
    // Signed by someone else.
    const other = await keyPair();
    const forged = await verifyLicense(await issue(other.priv), [pub]);
    expect(forged.state).toBe('invalid');
    expect(tierOf(forged)).toBe('basic');
    // A Basic key edited to say Pro.
    const basic = await issue(priv, { tier: 'basic' });
    const [p, payload, sig] = basic.split('.');
    const edited = b64url(new TextEncoder().encode(new TextDecoder().decode(Buffer.from(payload, 'base64url')).replace('"basic"', '"pro"')));
    expect(readLicense(`${p}.${edited}.${sig}`)?.info.tier).toBe('pro');
    expect((await verifyLicense(`${p}.${edited}.${sig}`, [pub])).state).toBe('invalid');
    // For another program.
    expect((await verifyLicense(await issue(priv, { product: 'other' }), [pub])).state).toBe('invalid');
  });

  it('an expired license gives the Basic features', async () => {
    const { priv, pub } = await keyPair();
    const key = await issue(priv, { expires: '2026-12-31' });
    expect((await verifyLicense(key, [pub], new Date('2026-12-31T12:00:00'))).state).toBe('valid');
    const late = await verifyLicense(key, [pub], new Date('2027-01-01T08:00:00'));
    expect(late.state).toBe('expired');
    expect(tierOf(late)).toBe('basic');
  });

  it('Pro is the Combine Report and the Automatic Takeoff', () => {
    expect(Object.keys(FEATURES).sort()).toEqual(['autoTakeoff', 'combine']);
  });
});
