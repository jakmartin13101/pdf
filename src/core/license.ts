// Licensing: what this copy of Takeoff Studio is licensed for. Two tiers – Basic and Pro – and a license
// key that says which, signed by BuildSuite and checked offline (no account, no server). Pro adds the
// Combine Report and the Automatic Takeoff. Kept on its own so a larger BuildSuite program can later supply
// the license instead.

import { trustedKeys } from './licenseKeys';

export type Tier = 'basic' | 'pro';
export type Feature = 'combine' | 'autoTakeoff';

export const TIER_NAMES: Record<Tier, string> = { basic: 'Basic', pro: 'Pro' };

/** What each tier includes beyond the basics (measuring, markups, Tool Chest, Markups List, reports…). */
export const TIER_FEATURES: Record<Tier, Feature[]> = { basic: [], pro: ['combine', 'autoTakeoff'] };

export const FEATURES: Record<Feature, { name: string; what: string }> = {
  combine: { name: 'Combine Report', what: 'Stock lengths to order for every size, with the cut list and the order list' },
  autoTakeoff: { name: 'Automatic Takeoff', what: 'Finds the labelled beams and tubing on a plan and measures them' },
};

/** Without a license the program runs with the Basic features. */
export const UNLICENSED_TIER: Tier = 'basic';

export const LICENSE_PREFIX = 'BSTS1';
const PRODUCT = 'takeoff-studio';

/** What a license key says (signed). */
export interface LicenseInfo {
  v: 1;
  product: string;
  tier: Tier;
  /** Licensed to. */
  name: string;
  company?: string;
  email?: string;
  /** YYYY-MM-DD. */
  issued: string;
  /** YYYY-MM-DD; none: does not expire. */
  expires?: string;
  id: string;
}

export type LicenseStatus =
  | { state: 'none' }
  | { state: 'valid'; info: LicenseInfo; key: string }
  | { state: 'expired'; info: LicenseInfo; key: string }
  | { state: 'invalid'; reason: string; key: string };

const fromB64url = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** A license key as pasted: whitespace and line breaks taken out. */
export const cleanKey = (key: string) => key.replace(/\s+/g, '');

/** The details in a license key (not yet checked), or null when it isn't one. */
export function readLicense(key: string): { info: LicenseInfo; payload: Uint8Array; sig: Uint8Array } | null {
  const [prefix, p, s, extra] = cleanKey(key).split('.');
  if (prefix !== LICENSE_PREFIX || !p || !s || extra !== undefined) return null;
  try {
    const payload = fromB64url(p);
    const info = JSON.parse(new TextDecoder().decode(payload)) as LicenseInfo;
    if (info?.v !== 1 || (info.tier !== 'basic' && info.tier !== 'pro') || typeof info.name !== 'string') return null;
    return { info, payload, sig: fromB64url(s) };
  } catch {
    return null;
  }
}

/** Check a license key: signed by a trusted key, for this program, and not expired. */
export async function verifyLicense(key: string, keys: JsonWebKey[] = trustedKeys(), now = new Date()): Promise<LicenseStatus> {
  const k = cleanKey(key);
  if (!k) return { state: 'none' };
  const read = readLicense(k);
  if (!read) return { state: 'invalid', reason: 'This is not a Takeoff Studio license key.', key: k };
  if (read.info.product !== PRODUCT) return { state: 'invalid', reason: 'This license is for another program.', key: k };
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { state: 'invalid', reason: 'License keys can’t be checked here.', key: k };
  let ok = false;
  for (const jwk of keys) {
    try {
      const pub = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      if (await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, read.sig as BufferSource, read.payload as BufferSource)) {
        ok = true;
        break;
      }
    } catch {
      /* try the next key */
    }
  }
  if (!ok) return { state: 'invalid', reason: 'This license key is not genuine (it may have been changed or mistyped).', key: k };
  if (read.info.expires && new Date(`${read.info.expires}T23:59:59`) < now) return { state: 'expired', info: read.info, key: k };
  return { state: 'valid', info: read.info, key: k };
}

/** The tier a license gives (expired and invalid ones: unlicensed). */
export function tierOf(s: LicenseStatus): Tier {
  return s.state === 'valid' ? s.info.tier : UNLICENSED_TIER;
}

export function hasFeature(s: LicenseStatus, f: Feature): boolean {
  return TIER_FEATURES[tierOf(s)].includes(f);
}
