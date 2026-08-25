# Contributing to AItomator

AItomator intentionally stays small: Bun, TypeScript, SQLite, four triggers, fresh runner processes, and deterministic CLI/JSON interfaces. Proposals should preserve that mental model and avoid infrastructure or UI requirements.

```bash
git clone <repository-url>
cd aitomator
bun install
bun test
bun run typecheck
bun run build
```

Add tests for behavior changes. Keep commands non-interactive when flags provide all required data, preserve stable JSON fields and exit codes, and never expose secrets in logs or SQLite by default.
