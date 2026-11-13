# Working on this template

This checkout is the template itself. Apps made with `npm run new-app` don't
carry this file, the `new-app` script, `scripts/blank/` or the changelog.

## Checks

```sh
npm ci
npm run lint && npm run format:check
npm run test:unit          # app-lib, scripts (new-app, docs), vendor
npm run prepare:prototype  # offline clients, then:
npm run test:e2e           # Playwright with mocked Nido pages and RPC
```

`E2E_VISUAL=1 npm run test:e2e` adds the screenshot comparison; baselines are
per platform and not committed.

## Changing things

- **Behaviour people rely on** (commands, the call pattern, session rules) is
  described twice: [`NIDO.md`](NIDO.md) for people and [`AGENTS.md`](AGENTS.md)
  for agents. Change both. `scripts/docs.test.ts` fails when either names an npm
  script that doesn't exist, or when their call-pattern snippets differ.
- **The `--blank` starter** lives in `scripts/blank/` and is not built here.
  After changing it, make a blank app and run its tests:
  `npm run new-app -- ../blank-check --blank`, then in it `npm ci`,
  `npm run prepare:prototype`, `cargo test`, `npm run build` and
  `npm run test:e2e`.
- **The pinned Scaffold** is `SCAFFOLD_PINNED` in `scripts/tools.mjs`.
- **A change a team would feel** (setup, deploy, the session flow) deserves the
  full run a new team makes, recorded like `docs/template-v2-check.md` in the
  kit repository: new-app with a fresh name, doctor, deploy to testnet with
  throwaway keys, and a real Nido account through `npm run test-browser`.
- Note each change in [`CHANGELOG.md`](CHANGELOG.md).
