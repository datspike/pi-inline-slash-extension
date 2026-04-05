# Architecture

## Overview

The extension keeps Pi core untouched and adds behavior at the extension layer.

Runtime flow:

1. `extensions/inline-slash.ts` activates on `session_start` when `ctx.hasUI` is true.
2. `buildCommandCatalog(api.getCommands())` builds a local catalog from public commands.
3. `src/inline-slash/editor.ts` wraps `CustomEditor` and wires the inline autocomplete provider.
4. `createInlineSlashSubmitStrategy` decides whether submit stays on the core path or uses `sendUserMessage` for a leading absolute path.
5. `ctx.ui.setEditorComponent(...)` registers the wrapped editor.

## Main files

| File | Purpose |
| --- | --- |
| `extensions/inline-slash.ts` | package entrypoint and runtime wiring |
| `src/inline-slash/command-catalog.ts` | public catalog builder based on `pi.getCommands()` |
| `src/inline-slash/provider.ts` | inline autocomplete provider for mid-line and second-line slash suggestions |
| `src/inline-slash/classifier.ts` | submit routing boundary for command vs absolute path |
| `src/inline-slash/editor.ts` | editor wrapper and `createInlineSlashSubmitStrategy` |
| `docs/UPSTREAM-SEAMS.md` | remaining upstream seam request |

## Public boundaries

The shipped behavior intentionally stays inside a small set of public seams:

- `ctx.ui.setEditorComponent(...)`
- `CustomEditor`
- `pi.getCommands()`
- `sendUserMessage`
- editor methods such as `getText()`, `getLines()`, `getCursor()`, `setAutocompleteProvider()`

Behavioral boundaries:

- the catalog is built from `pi.getCommands()` only;
- `sourceInfo` is treated as the canonical provenance contract;
- `/unknown` stays on the delegated core path;
- non-slash autocomplete such as `@` references stays delegated to the core provider;
- first-line slash behavior remains core behavior.

## Remaining seam

The only notable runtime fragility is isolated in `src/inline-slash/editor.ts`: inline refresh still depends on a narrow editor runtime seam that is not yet formalized as a public extension API.

That seam is documented separately in `docs/UPSTREAM-SEAMS.md`.
