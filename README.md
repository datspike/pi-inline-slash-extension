# pi-inline-slash-extension

Shipped extension for Pi that adds inline slash autocomplete inside regular text and a bypass for leading absolute paths without forking core.

<!-- verifier:readme/shipped-scope -->
## What is actually shipped

- inline slash and skill autocomplete works not only at the start of the first line, but also mid-line and on the second line;
- a leading absolute path such as `/home/spike/file.ts` or `/tmp/log.txt` is sent as a normal user message instead of being treated as a slash command;
- the first-line start-of-line slash path remains delegated core behavior;
- the current scope is proven by local tests and shell verifiers, without an upstream patch.

## Usage modes

### Ecosystem package

The extension is packaged as a Pi package entrypoint through `extensions/inline-slash.ts` and `package.json -> pi.extensions`. That makes the package installable in the Pi ecosystem, but it does not change the fact that inline autocomplete still depends on part of the editor runtime seam that is not yet formalized as a stable public API.

### Global extension path

If you prefer not to install the package, you can point Pi directly at `extensions/inline-slash.ts` from a global extension directory or settings-based extension path. This repository intentionally treats the package entrypoint as the only shipped runtime entrypoint.

<!-- verifier:readme/architecture -->
## Architecture

The extension is wired through the package entrypoint `extensions/inline-slash.ts`. Activation happens on `session_start` only when `ctx.hasUI` is true.

Entry point:

1. builds the public inline catalog via `buildCommandCatalog(api.getCommands())`;
2. creates an editor wrapper on top of `CustomEditor` via `createInlineSlashEditorClass(...)`;
3. attaches the submit strategy via `createInlineSlashSubmitStrategy(api)`;
4. registers the new editor through `ctx.ui.setEditorComponent(...)`.

Core is not patched: the extension extends the editor/runtime seam on top of public API and keeps the standard first-line slash path delegated to core.

## How to connect the extension to Pi

### Install as a Pi package

The package entrypoint is located at `extensions/inline-slash.ts`, and `package.json` declares the `pi.extensions` manifest. Local install:

```bash
pi install /absolute/path/to/pi-inline-slash-extension
```

### Global setup by absolute path

If you need a direct path without `pi install`, the extension can stay in the global Pi settings file or be exposed through your global extension directory setup:

```json
~/.pi/agent/settings.json
```

Minimal example:

```json
{
  "extensions": [
    "/absolute/path/to/pi-inline-slash-extension/extensions/inline-slash.ts"
  ]
}
```

### What counts as successful wiring

- the agent starts without an import error from `extensions/inline-slash.ts`;
- in a UI session after `/reload`, the scenario `text /gs` -> `/gsd` autocomplete works;
- submit for `'/home/spike/file.ts'` no longer goes to `Unknown command` and instead stays a normal user message.

<!-- verifier:readme/runtime-seams -->
## Runtime seams

| File | Runtime role | What matters for a truth-first description |
| --- | --- | --- |
| `extensions/inline-slash.ts` | package entrypoint | installable entrypoint for a Pi package and global wiring |
| `src/inline-slash/command-catalog.ts` | public catalog builder | accepts only public commands from `pi.getCommands()` with source `extension`, `prompt`, `skill`; uses `sourceInfo` as the canonical provenance contract |
| `src/inline-slash/editor.ts` | editor wrapper | wraps `onSubmit`, forwards the delegate autocomplete provider, and refreshes inline slash suggestions after normal `handleInput` |
| `src/inline-slash/provider.ts` | autocomplete provider | delegates all non-inline-slash contexts to the core provider; builds mid-line and second-line slash suggestions from the local catalog |
| `src/inline-slash/classifier.ts` | token classifier and submit boundary | distinguishes command, `skill:*`, and absolute-path candidates around the current token; after `trim()` it reads only the leading token and decides `delegate-core-submit` vs `send-user-message` |
| `src/inline-slash/editor.ts` | runtime submit shim | `createInlineSlashSubmitStrategy` adds a history entry and calls `sendUserMessage` for an absolute path; everything else goes to core submit |
| `docs/UPSTREAM-SEAMS.md` | upstream seam request | records the minimal public API needed to remove the remaining dependency on editor internals |

## Current state of the Pi runtime dependency

The stable part of the solution sits on public seams:

- `ctx.ui.setEditorComponent(...)`;
- `CustomEditor`;
- `pi.getCommands()`;
- `sendUserMessage(...)`;
- public editor methods `getText()`, `getLines()`, `getCursor()`, `setAutocompleteProvider()`.

The remaining fragility is isolated in one place: `src/inline-slash/editor.ts` still forces autocomplete refresh through runtime editor methods that are not documented as an extension contract. The dependency has been reduced to the smallest useful hook set and no longer uses editor `state`.

<!-- verifier:readme/verified-scenarios -->
## Verified scenarios

### Automated proof

Automated checks cover three layers:

- `tests/inline-slash/provider.test.ts`
  - `inline-gsd`, `inline-skill`, `second-line-gsd`;
  - suppression for absolute paths;
  - delegated first-line behavior;
  - safe no-op on malformed bounds.
- `tests/inline-slash/submit-routing.test.ts`
  - bypass for `/home/...` and `/tmp/...`;
  - delegated submit for `/gsd auto`, `/skill:create-skill demo`, `/unknown`, plain text, and an empty buffer;
  - routing reads only the leading token after `trim()`.
- `tests/inline-slash/editor-smoke.test.ts`
  - the normal typing cycle really refreshes autocomplete on the second line and mid-line;
  - the submit strategy calls `sendUserMessage` only for a leading absolute path;
  - smoke tests import `extensions/inline-slash.ts` and verify wiring through `setEditorComponent`.

### What is specifically proven

- `text /gs` -> the local inline catalog suggests `/gsd`;
- `text /skill:create` -> the local inline catalog suggests `/skill:create-skill`;
- second line `/gs` -> autocomplete works without a first-line restriction;
- `/home/spike/file.ts` and `/tmp/log.txt` bypass slash dispatch on submit;
- `/gsd auto`, `/skill:create-skill demo`, and `/unknown` remain on the delegated core submit path.

<!-- verifier:readme/verification-commands -->
## Verification surface

### Top-level

```bash
npm run verify:s03
bash scripts/verify-s03.sh
```

`verify:s03` is the single discoverable entrypoint for this verification surface. It composes the existing proof surfaces and then validates the README markers.

### Drill-down

```bash
npm run verify:s01
bash scripts/verify-s01.sh
npm run verify:s02
bash scripts/verify-s02.sh
```

- `verify:s01` -> inline autocomplete, catalog, and provider proof;
- `verify:s02` -> submit routing, editor smoke, and `tsc --noEmit`;
- `verify:s03` -> orchestration on top of S01/S02 plus the README guard.

Automated proof and live runtime proof are intentionally separate: the commands above confirm code-level invariants, while the manual `/reload` checklist below confirms behavior in the real TUI.

<!-- verifier:readme/manual-reload-checklist -->
## Manual `/reload` checklist

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
## Proven limitations and boundaries

- the inline catalog is built only from public `pi.getCommands()` output; the extension does not synthesize or promise a full built-in slash catalog;
- the local catalog accepts only public sources `extension`, `prompt`, `skill`;
- `sourceInfo` is used as the only canonical provenance contract;
- first-line start-of-message slash autocomplete remains delegated core behavior instead of replacing the core provider locally;
- non-slash autocomplete contexts such as `@` file references stay delegated to the core provider;
- submit bypass looks only at the leading token after `trim()`: an absolute path at the start of the message is bypassed, everything else goes to `delegate-core-submit`;
- `/unknown` intentionally remains delegated core unknown-command handling;
- the extension requires `sendUserMessage` only for absolute-path bypass; absence of this API is treated as a wiring failure and fails loudly;
- package installability is not the same as full API stability: inline refresh still depends on a narrow editor runtime seam;
- the compatibility SLA below is intentionally narrower than a purely public extension API.

## Compatibility SLA

- working and verified baseline: `@mariozechner/pi-coding-agent` `^0.65.0`;
- the extension promises shipped-scope stability only while the public seams `setEditorComponent`, `CustomEditor`, `pi.getCommands()`, `sendUserMessage`, `getLines`, `getCursor`, and `setAutocompleteProvider` remain available;
- if the runtime editor seam changes, inline refresh may degrade into a missing mid-line popup, but the submit boundary for absolute paths and the project/package wiring should remain detectable by tests;
- any scope expansion beyond the shipped behavior requires a separate re-check against newer Pi versions.

<!-- verifier:readme/upstream-patch-plan -->
## Upstream patch plan

For the shipped scope, an upstream patch in core is still not required. The current implementation and tests prove the required behavior at the extension layer.

But a product-grade package still needs a small upstream patch: a public editor seam for `open/refresh/close autocomplete` and, separately, a hook before slash dispatch for the submit boundary. Details are in `docs/UPSTREAM-SEAMS.md`.

Reasons to revisit an upstream patch include at least one of the following requirements:

- inline autocomplete for built-in commands that are not present in public `pi.getCommands()`;
- changing core unknown-command handling for `/unknown`;
- changing the standard first-line slash behavior instead of delegating to core;
- removing the remaining dependency on runtime editor internals for more reliable package-level compatibility.
