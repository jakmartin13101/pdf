# Test license key

A key pair for automated tests only. Development builds (the Vite dev server the browser tests run against)
trust its public key; released builds (the Windows installer, the web version) do not, so licenses signed
with this private key do nothing outside development.

    node scripts/license.mjs issue --tier pro --name "Test" --key e2e/fixtures/license-test/private-key.jwk.json
