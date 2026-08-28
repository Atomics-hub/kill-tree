# Security policy

## Supported versions

The latest published minor version receives security fixes. During the 0.x series, safety fixes may make behavior stricter.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Atomics-hub/kill-tree/security/advisories/new). Do not open a public issue for a PID-reuse, command-injection, or process-escape vulnerability before a fix is available.

Include the operating system, Node.js version, process topology, signals, options, report, and a minimal reproduction. We aim to acknowledge reports within three business days.

## Security boundaries

`kill-tree` signals local processes with the current user's permissions. Calling it is a privileged application action; never pass an untrusted PID or signal directly from a network request.

The package:

- rejects non-positive PIDs and protects PID 1 by default;
- uses process creation identity where the platform exposes it;
- never interpolates PIDs or signals into a shell command;
- reports tracked survivors, skipped identities, and signaling failures;
- uses only fixed arguments when invoking platform process-list tools.

The package cannot:

- signal processes the current user is not permitted to signal;
- provide an atomic snapshot-and-kill operation using portable Node.js APIs;
- observe a descendant that daemonizes and is reparented between snapshots;
- prevent a hostile owned child from escaping a POSIX process group;
- provide Windows Job Object containment without a native component;
- guarantee that a numeric signal has identical meaning on every operating system.

Treat termination reports as operational evidence, not an authorization decision or a proof that no related process exists anywhere on the host.
