# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-08-27

### Fixed

- Resolve npm bin symlinks before detecting the CLI entrypoint, so `npx @a5omic/kill-tree` and installed `kill-tree` commands execute correctly.
- Remove platform-path and startup races from cross-platform process fixtures.

## [0.1.0] - 2026-08-27

### Added

- Graceful, identity-aware process-tree termination with forced escalation.
- Repeated descendant discovery and leaf-first signaling.
- Structured termination and one-shot signal reports.
- A callback-compatible default export for migration from `tree-kill`.
- Owned-child process-group cleanup through `spawnGuarded` on POSIX.
- Cross-platform CLI, ESM, CommonJS, and TypeScript declarations.
