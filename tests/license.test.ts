import { describe, expect, it } from 'vitest';
import { FEATURES, LICENSE_PREFIX, TRIAL_DAYS, accessName, accessOf, hasFeature, licenseTier, readLicense, trialDaysLeft, verifyLicense, type LicenseInfo, type LicenseStatus } from '../src/core/license';

/** Access with a license and no trial left. */
const licensed = (s: LicenseStatus) => accessOf(s, null);

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
    expect(licenseTier(pro)).toBe('pro');
    expect(hasFeature(licensed(pro), 'combine')).toBe(true);
    expect(hasFeature(licensed(pro), 'autoTakeoff')).toBe(true);
    const basic = await verifyLicense(await issue(priv, { tier: 'basic' }), [pub]);
    expect(licensed(basic)).toEqual({ tier: 'basic', trial: false, daysLeft: 0 });
    expect(hasFeature(licensed(basic), 'combine')).toBe(false);
    expect(hasFeature(licensed(basic), 'autoTakeoff')).toBe(false);
    // Pasted with line breaks and spaces.
    const key = await issue(priv);
    expect((await verifyLicense(`  ${key.slice(0, 40)}\n${key.slice(40)} `, [pub])).state).toBe('valid');
  });

  it('a license that is not genuine gives nothing', async () => {
    const { priv, pub } = await keyPair();
    const none = await verifyLicense('', [pub]);
    expect(none.state).toBe('none');
    expect(licenseTier(none)).toBeNull();
    expect((await verifyLicense('hello', [pub])).state).toBe('invalid');
    // Signed by someone else.
    const other = await keyPair();
    const forged = await verifyLicense(await issue(other.priv), [pub]);
    expect(forged.state).toBe('invalid');
    expect(licensed(forged).tier).toBeNull();
    // A Basic key edited to say Pro.
    const basic = await issue(priv, { tier: 'basic' });
    const [p, payload, sig] = basic.split('.');
    const edited = b64url(new TextEncoder().encode(new TextDecoder().decode(Buffer.from(payload, 'base64url')).replace('"basic"', '"pro"')));
    expect(readLicense(`${p}.${edited}.${sig}`)?.info.tier).toBe('pro');
    expect((await verifyLicense(`${p}.${edited}.${sig}`, [pub])).state).toBe('invalid');
    // For another program.
    expect((await verifyLicense(await issue(priv, { product: 'other' }), [pub])).state).toBe('invalid');
  });

  it('an expired license gives nothing (the trial, while it lasts)', async () => {
    const { priv, pub } = await keyPair();
    const key = await issue(priv, { expires: '2026-12-31' });
    expect((await verifyLicense(key, [pub], new Date('2026-12-31T12:00:00'))).state).toBe('valid');
    const late = await verifyLicense(key, [pub], new Date('2027-01-01T08:00:00'));
    expect(late.state).toBe('expired');
    expect(licenseTier(late)).toBeNull();
    expect(accessOf(late, null).tier).toBeNull();
  });

  it('a new install runs as a Basic trial for a week, then needs a license', () => {
    const start = '2026-10-21T09:00:00.000Z';
    const at = (h: number) => new Date(Date.parse(start) + h * 3600e3);
    expect(TRIAL_DAYS).toBe(7);
    expect(trialDaysLeft(start, at(0))).toBe(7);
    expect(trialDaysLeft(start, at(24 * 6 + 1))).toBe(1);
    expect(trialDaysLeft(start, at(24 * 7 - 1))).toBe(1);
    expect(trialDaysLeft(start, at(24 * 7))).toBe(0);
    const none: LicenseStatus = { state: 'none' };
    const trial = accessOf(none, start, at(30));
    expect(trial).toEqual({ tier: 'basic', trial: true, daysLeft: 6 });
    expect(accessName(trial)).toBe('Trial');
    expect(hasFeature(trial, 'combine')).toBe(false);
    const over = accessOf(none, start, at(24 * 8));
    expect(over.tier).toBeNull();
    expect(accessName(over)).toBe('Unlicensed');
    // The clock put back before the trial started: no trial.
    expect(trialDaysLeft(start, at(-48))).toBe(0);
    expect(trialDaysLeft(null)).toBe(0);
  });

  it('a license goes on after the trial', async () => {
    const { priv, pub } = await keyPair();
    const basic = await verifyLicense(await issue(priv, { tier: 'basic' }), [pub]);
    const access = accessOf(basic, '2020-01-01T00:00:00.000Z');
    expect(access).toEqual({ tier: 'basic', trial: false, daysLeft: 0 });
    expect(accessName(access)).toBe('Basic');
  });

  it('Pro is the Combine Report and the Automatic Takeoff', () => {
    expect(Object.keys(FEATURES).sort()).toEqual(['autoTakeoff', 'combine']);
  });
});
