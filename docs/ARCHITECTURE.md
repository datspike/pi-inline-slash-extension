# Architecture

## Overview

The extension keeps Pi core untouched and adds behavior at the extension layer.

Runtime flow:

1. `extensions/inline-slash.ts` builds a local catalog from public commands and registers the `input` handler.
2. The `input` handler transforms only interactive/RPC text containing exact public `source="prompt"` tokens; extension-generated input is passed through.
3. `src/inline-slash/prompt-expansion.ts` reads `sourceInfo.path`, removes YAML frontmatter, and preserves Markdown bodies while skipping code regions and leading core invocations.
4. `src/inline-slash/editor.ts` wraps `CustomEditor` and wires the inline autocomplete provider.
5. `createInlineSlashSubmitStrategy` decides whether submit stays on the core path or uses `sendUserMessage` for a leading absolute path.
6. `ctx.ui.setEditorComponent(...)` registers the wrapped editor.

## Main files

| File | Purpose |
| --- | --- |
| `extensions/inline-slash.ts` | package entrypoint and runtime wiring |
| `src/inline-slash/command-catalog.ts` | public catalog builder based on `pi.getCommands()` |
| `src/inline-slash/provider.ts` | inline autocomplete provider for mid-line and second-line slash suggestions |
| `src/inline-slash/classifier.ts` | submit routing boundary for command vs absolute path |
| `src/inline-slash/editor.ts` | editor wrapper and `createInlineSlashSubmitStrategy` |
| `src/inline-slash/prompt-expansion.ts` | pure prompt-template expansion and Markdown protection |
| `docs/UPSTREAM-SEAMS.md` | remaining upstream seam request |

## Public boundaries

The shipped behavior intentionally stays inside a small set of public seams:

- `ctx.ui.setEditorComponent(...)`
- `CustomEditor`
- `pi.getCommands()`
- `input` event transform result
- `sendUserMessage`
- editor methods such as `getText()`, `getLines()`, `getCursor()`, `setAutocompleteProvider()`

Behavioral boundaries:

- the catalog is built from `pi.getCommands()` only;
- prompt expansion uses only `source="prompt"` entries and treats `sourceInfo.path` as the canonical template path;
- read failures leave their token unchanged and may produce a compact UI warning;
- `/unknown` stays on the delegated core path;
- non-slash autocomplete such as `@` references stays delegated to the core provider;
- first-line slash behavior remains core behavior.

## Remaining seam

The only notable runtime fragility is isolated in `src/inline-slash/editor.ts`: inline refresh still depends on a narrow editor runtime seam that is not yet formalized as a public extension API.

That seam is documented separately in `docs/UPSTREAM-SEAMS.md`.
