# Security Policy

## Reporting a vulnerability

Report it privately with GitHub's private vulnerability reporting:
<https://github.com/nidohq/blog/security/advisories/new> (the repository's
Security tab, "Report a vulnerability"). Please don't open a public issue for
it.

## Scope

On mainnet the blog moves real XLM, so these matter most:

- the blog contract ([`contracts/blog`](contracts/blog/src/lib.rs)): who may
  post, comment, tip and upgrade, where a tip's XLM can go, and anything that
  lets one person stop others from using it;
- the approval the app asks a Nido account for
  ([`app/src/blog.ts`](app/src/blog.ts)): what the app's passkey may do, and the
  tip cap;
- the deploy, upgrade and keep-alive scripts
  ([`scripts/mainnet.mjs`](scripts/mainnet.mjs)): anything that sends a
  transaction without the typed confirmation or prints a secret.

Nido's wallet and relayer, and the Perch smart accounts they use, are separate
projects: report those at <https://github.com/nidohq/nido> and
<https://github.com/stellar-registry/perch>.

## Supported versions

The code on `main`, and the contract it deploys. A deployed blog runs the code
it was last upgraded to; its admin fixes it in place with
`npm run upgrade:mainnet` (see the README).
