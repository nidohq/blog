# Temporary Nido module snapshot

Source:
[nidohq/nido at 3e3f350](https://github.com/nidohq/nido/tree/3e3f350/packages/stellar-wallets-kit-module/src),
Apache-2.0 (LICENSE included).

Copied `index.ts`, `module.ts`, `urls.ts`, `handover.ts`, and `redirect.ts`.
This private workspace is versioned `0.1.1-spike`; it is not an npm release.

Local changes:

- Replace the two `@nidohq/passkey-sdk` imports of `isContractId` with the
  template's existing `StrKey.isValidContract`, avoiding the older SDK's
  transitive account bindings and duplicate Stellar SDK versions.
- Require both expected `event.origin` and the actual popup `event.source`, and
  check that `search` is a string before accepting a handover result.
- Add non-null assertions after regex matches / guarded split lengths to satisfy
  the template's stricter indexed-access TypeScript settings.
- Add `reserveCeremonyPopup()`: opens the named popup during the user's click so
  the later `signTransaction` reuses it instead of being popup-blocked after the
  dApp's RPC simulation.
- Export the TypeScript source directly for Vite and mark the package private.
- Apply the template's formatter.

The source snapshot handles `nido_submitted` responses, unlike published 0.1.0.
Replace this workspace with a reviewed public release when available.
