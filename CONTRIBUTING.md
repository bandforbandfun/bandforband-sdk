# Contributing

## Source of truth

Product development happens in the private monorepo. This repository is a scrubbed public mirror of `packages/agent`.

## Syncing a new public release

1. Land changes in the private monorepo first.
2. Copy `packages/agent` into a clean staging clone of this repo (exclude `node_modules`, `dist`, `.turbo`, `.env*`).
3. Ensure the package is standalone: no `workspace:*` deps; plain `tsconfig` / `eslint` / `vitest`.
4. Run a secret scrub (reject `.env`, private keys, `wallet-auth:`, real API tokens, deployer keypairs).
5. Commit and push to `main`. Tag releases when publishing to npm.

Do not mirror the whole private monorepo automatically.
