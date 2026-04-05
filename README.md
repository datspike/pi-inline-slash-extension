# pi-inline-slash-extension

Pi extension that makes slash autocomplete usable inside normal text and prevents leading absolute paths from being mistaken for commands.

This repository ships an installable extension package with a narrow, verified scope. If you opened the repo from search or GitHub, the short version is simple: install it, reload Pi, and you get inline slash suggestions mid-line and on the second line, plus safe submit behavior for paths like `/home/spike/file.ts`.

## Why this exists

Pi already handles slash commands well at the start of the first line. This extension covers the two gaps that are most noticeable in day-to-day use:

- inline slash autocomplete inside regular text;
- slash autocomplete on the second line;
- submit bypass for a leading absolute path such as `/tmp/log.txt`.

<!-- verifier:readme/shipped-scope -->
## Features

What is actually shipped:

- inline slash and skill autocomplete works not only at the start of the first line, but also mid-line and on the second line;
- a leading absolute path such as `/home/spike/file.ts` or `/tmp/log.txt` is sent as a normal user message instead of being treated as a slash command;
- the first-line start-of-line slash path remains delegated core behavior;
- the current scope is proven by local tests and shell verifiers, without an upstream patch.

## Quick start

### Install as a Pi package

```bash
pi install /absolute/path/to/pi-inline-slash-extension
```

### Reload Pi

```text
/reload
```

### Try these scenarios

- type `text /gs` -> expect `/gsd` autocomplete;
- type `text /skill:create` -> expect `/skill:create-skill` autocomplete;
- type `/home/spike/file.ts` and press Enter -> expect a normal user message, not command routing.

## At a glance

| Capability | Status |
| --- | --- |
| Mid-line slash autocomplete | supported |
| Second-line slash autocomplete | supported |
| Leading absolute path submit bypass | supported |
| Override of core first-line slash behavior | not supported |
| Synthetic catalog of hidden built-in commands | not supported |

<!-- verifier:readme/architecture -->
## How it works

The extension is wired through the package entrypoint `extensions/inline-slash.ts`. Activation happens on `session_start` only when `ctx.hasUI` is true.

High-level flow:

1. builds the public inline catalog via `buildCommandCatalog(api.getCommands())`;
2. wraps `CustomEditor` via `src/inline-slash/editor.ts`;
3. attaches submit routing through `createInlineSlashSubmitStrategy`;
4. registers the editor through `ctx.ui.setEditorComponent(...)`.

Core is not patched. The extension adds behavior at the extension layer and keeps the standard first-line slash path delegated to core.

## Installation options

### Package install

The package entrypoint is `extensions/inline-slash.ts`, and `package.json` declares the `pi.extensions` manifest.

```bash
pi install /absolute/path/to/pi-inline-slash-extension
```

### Direct path wiring

If you prefer not to install the package, Pi can load the same entrypoint directly from settings:

```json
{
  "extensions": [
    "/absolute/path/to/pi-inline-slash-extension/extensions/inline-slash.ts"
  ]
}
```

Typical settings file:

```text
~/.pi/agent/settings.json
```

### Expected result after wiring

- Pi starts without an import error from `extensions/inline-slash.ts`;
- after `/reload`, typing `text /gs` shows `/gsd`;
- submitting `/home/spike/file.ts` no longer goes to `Unknown command` and instead stays a normal user message.

<!-- verifier:readme/runtime-seams -->
## Implementation notes

The main code paths are intentionally small and isolated:

| File | Purpose |
| --- | --- |
| `extensions/inline-slash.ts` | package entrypoint and runtime wiring |
| `src/inline-slash/command-catalog.ts` | public catalog builder based on `pi.getCommands()` |
| `src/inline-slash/provider.ts` | inline autocomplete provider for mid-line and second-line slash suggestions |
| `src/inline-slash/classifier.ts` | submit routing boundary for command vs absolute path |
| `src/inline-slash/editor.ts` | editor wrapper and `createInlineSlashSubmitStrategy` |
| `docs/UPSTREAM-SEAMS.md` | remaining upstream seam request |

Important boundaries:

- the catalog is built from `pi.getCommands()` only;
- `sourceInfo` is treated as the canonical provenance contract;
- `sendUserMessage` is required only for the absolute-path bypass path;
- `/unknown` stays on the delegated core path.

The stable public seams cover most of the solution. The remaining fragility is isolated in `src/inline-slash/editor.ts`, where inline refresh still depends on a narrow editor runtime seam that is not yet formalized as a public extension API.

<!-- verifier:readme/verified-scenarios -->
## What is verified

Automated proof covers the shipped user-facing behavior:

- `text /gs` -> the local inline catalog suggests `/gsd`;
- `text /skill:create` -> the local inline catalog suggests `/skill:create-skill`;
- second line `/gs` -> autocomplete works without a first-line restriction;
- `/home/spike/file.ts` and `/tmp/log.txt` bypass slash dispatch on submit;
- `/gsd auto`, `/skill:create-skill demo`, and `/unknown` remain on the delegated core submit path.

Test coverage lives in:

- `tests/inline-slash/provider.test.ts`;
- `tests/inline-slash/submit-routing.test.ts`;
- `tests/inline-slash/editor-smoke.test.ts`.

<!-- verifier:readme/verification-commands -->
## Verification

Main command:

```bash
npm run verify:s03
bash scripts/verify-s03.sh
```

Drill-down commands:

```bash
npm run verify:s01
bash scripts/verify-s01.sh
npm run verify:s02
bash scripts/verify-s02.sh
```

`verify:s03` is the main verification entrypoint. It runs the shipped proof surface and validates the README markers used by the repository guards.

## Manual `/reload` checklist

<!-- verifier:readme/manual-reload-checklist -->
After loading the extension in Pi, run `/reload` and verify the following scenarios:

- `scenario:inline-gsd-mid-line` -> type `text /gs` and confirm that `/gsd` autocomplete appears.
- `scenario:inline-skill-mid-line` -> type `text /skill:create` and confirm that `/skill:create-skill` appears.
- `scenario:second-line-gsd` -> on the second line type `/gs` and confirm that `/gsd` appears.
- `scenario:path-home-submit-bypass` -> type `/home/spike/file.ts` and press Enter; expected result is normal user-message behavior without `Unknown command`.
- `scenario:path-tmp-submit-bypass` -> type `/tmp/log.txt` and press Enter; expected result is the same bypass through a normal message.
- `scenario:delegate-gsd-submit` -> on the first line type `/gsd auto` and press Enter; expected result is the normal slash command path.
- `scenario:delegate-skill-submit` -> on the first line type `/skill:create-skill demo` and press Enter; expected result is the normal skill submit path.
- `scenario:delegate-unknown-submit` -> on the first line type `/unknown` and press Enter; expected result is core unknown-command handling, not a normal user message.

<!-- verifier:readme/proven-limitations -->
## Current limitations

- the inline catalog is built only from public `pi.getCommands()` output and does not synthesize a full built-in slash catalog;
- only public sources `extension`, `prompt`, `skill` are accepted;
- first-line start-of-message slash autocomplete remains delegated core behavior;
- non-slash autocomplete contexts such as `@` file references stay delegated to the core provider;
- submit bypass looks only at the leading token after `trim()`: a leading absolute path is bypassed, everything else goes to core submit;
- `/unknown` intentionally remains delegated core unknown-command handling;
- package installability is not the same as full API stability, because inline refresh still depends on a narrow editor runtime seam.

Compatibility baseline:

- working and verified baseline: `@mariozechner/pi-coding-agent` `^0.65.0`.

<!-- verifier:readme/upstream-patch-plan -->
## Upstream considerations

For the shipped scope, an upstream patch is not required. The current package and tests prove the needed behavior at the extension layer.

A small upstream patch would still improve long-term package stability: a public editor seam for autocomplete open/refresh/close and a pre-dispatch submit hook. Details are in `docs/UPSTREAM-SEAMS.md`.

Reasons to revisit an upstream patch:

- support inline autocomplete for built-in commands that are not present in public `pi.getCommands()`;
- change core handling for `/unknown`;
- change the standard first-line slash behavior instead of delegating to core;
- remove the remaining dependency on editor internals for more reliable compatibility.

## Related docs

- `docs/UPSTREAM-SEAMS.md` for the remaining editor/runtime seam request.
