// Public keys that sign Takeoff Studio license keys (scripts/license.mjs). Only the public half is here:
// the private key that issues licenses is kept out of the repository (a GitHub Actions secret).

/** BuildSuite Takeoff Studio license signing key. */
export const PRODUCTION_KEYS: JsonWebKey[] = [
  { kty: 'EC', crv: 'P-256', x: 'cADpVphKQydLrRNiOITxfqjiZIFx4okaGusyx_UrLSQ', y: 'OKZigm1NWTNE--CW2Gh-iwHB6FO7Mh-5FAJ3Rm7YXr4' },
];

/** Test key (e2e/fixtures/license-test): trusted by development builds only, never by a released program. */
export const TEST_KEYS: JsonWebKey[] = [
  { kty: 'EC', crv: 'P-256', x: 'Jk3PbkpOSflQ7s7lPoNnjFadothSSHB-YK_HfDqncBw', y: 'XFcSXPnYBVSe0Er5vjjMzXRhzH9tb2tOkAiIze55i-w' },
];

/** The keys this build trusts. */
export function trustedKeys(): JsonWebKey[] {
  return import.meta.env.DEV ? [...PRODUCTION_KEYS, ...TEST_KEYS] : PRODUCTION_KEYS;
}
