# Contributing

Process-tree bugs are timing- and platform-sensitive. Reproductions and CI results from unusual process topologies are especially welcome.

1. Open an issue before changing the public API or guarantees.
2. Report security issues privately as described in `SECURITY.md`.
3. Install with `npm ci`.
4. Add a regression test that fails before the change.
5. Run `npm run verify` and `npm run test:stress`.
6. Explain the tested operating systems and any guarantee boundary affected.

Keep runtime dependencies at zero unless a proposal demonstrates a compelling portability and maintenance benefit. Tests must clean up every process they create, even after assertion failures.
