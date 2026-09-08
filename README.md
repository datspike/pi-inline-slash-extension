# @datspike/pi-inline-slash-extension

Installable Pi extension that makes slash autocomplete work where people actually type: inside normal text and on the second line. It also expands public prompt templates inside ordinary text and stops leading absolute paths such as `/home/spike/file.ts` from being misrouted as slash commands.

If you found this repo from GitHub search, the practical summary is simple: install it, run `/reload`, and you get better inline slash UX without forking Pi core.

## Why this exists

Pi already handles slash commands well at the start of the first line. This extension covers the two gaps that are most noticeable in day-to-day use:

- inline slash autocomplete inside regular text;
- slash autocomplete on the second line;
- inline expansion of public prompt templates such as `/ru-clean`;
- submit bypass for a leading absolute path such as `/tmp/log.txt`.

## Demo

```text
Before:
text /gs             -> no useful inline slash completion
/home/spike/file.ts  -> can be treated as a slash command

After:
text /gs             -> suggests /gsd
text /skill:create   -> suggests /skill:create-skill
text /ru-clean       -> expands the public prompt body
/home/spike/file.ts  -> sent as a normal user message
```

<!-- verifier:readme/shipped-scope -->
## Features

What is actually shipped:

- inline slash and skill autocomplete works not only at the start of the first line, but also mid-line and on the second line;
- known public prompt commands expand to their UTF-8 Markdown body inside ordinary text, including multiple tokens and multiline input;
- leading prompt invocations remain delegated to core so template arguments keep working;
- fenced code, inline code, escaped tokens, unknown slash tokens, skills, and absolute paths remain safe;
- a leading absolute path such as `/home/spike/file.ts` or `/tmp/log.txt` is sent as a normal user message instead of being treated as a slash command;
- the current scope is proven by local tests and shell verifiers, without an upstream patch.

## Quick start

### 1. Install as a Pi package

```bash
pi install npm:@datspike/pi-inline-slash-extension
```

### 2. Reload Pi

```text
/reload
```

### 3. Try these scenarios

- type `text /gs` -> expect `/gsd` autocomplete;
- type `text /skill:create` -> expect `/skill:create-skill` autocomplete;
- type `/home/spike/file.ts` and press Enter -> expect a normal user message, not command routing.

If these checks pass, the extension is wired correctly.

## At a glance

| Capability | Status |
| --- | --- |
| Mid-line slash autocomplete | supported |
| Second-line slash autocomplete | supported |
| Leading absolute path submit bypass | supported |
| Inline public prompt-template expansion | supported |
| Override of core first-line slash behavior | not supported |
| Synthetic catalog of hidden built-in commands | not supported |

## Who this is for

This repository is a good fit if you:

- use Pi interactively and often type slash commands inside longer prompts;
- want `/home/...` or `/tmp/...` inputs to stay normal messages;
- want an extension-layer solution without maintaining a Pi core fork.

It is probably not the right fit if you need a full built-in slash catalog or want to change core first-line slash behavior.

<!-- verifier:readme/architecture -->
## How it works

The extension is wired through the package entrypoint `extensions/inline-slash.ts` and activates on `session_start` when `ctx.hasUI` is true.

High-level flow:

1. builds the public inline catalog via `buildCommandCatalog(api.getCommands())`;
2. registers an `input` handler that expands only exact public `source="prompt"` tokens;
3. wraps `CustomEditor` via `src/inline-slash/editor.ts`;
4. attaches submit routing through `createInlineSlashSubmitStrategy`;
5. registers the editor through `ctx.ui.setEditorComponent(...)`.

Core is not patched. More detail: `docs/ARCHITECTURE.md`.

## Installation options

### Package install

The package entrypoint is `extensions/inline-slash.ts`, and `package.json` declares the `pi.extensions` manifest.

```bash
pi install npm:@datspike/pi-inline-slash-extension
```

This is the recommended setup for normal use after npm publication.

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

Main files:

- `extensions/inline-slash.ts`
- `src/inline-slash/command-catalog.ts`
- `src/inline-slash/provider.ts`
- `src/inline-slash/classifier.ts`
- `src/inline-slash/editor.ts`
- `src/inline-slash/prompt-expansion.ts`
- `docs/UPSTREAM-SEAMS.md`

Important boundaries:

- the catalog is built from `pi.getCommands()` only;
- prompt expansion reads only `source="prompt"` entries and uses `sourceInfo.path` as the template path;
- `sourceInfo` is treated as the canonical provenance contract;
- `sendUserMessage` is required only for the absolute-path bypass path;
- `/unknown` stays on the delegated core path.

The remaining editor seam is isolated in `src/inline-slash/editor.ts`. More detail: `docs/ARCHITECTURE.md` and `docs/UPSTREAM-SEAMS.md`.

<!-- verifier:readme/verified-scenarios -->
## What is verified

Automated proof covers the shipped user-facing behavior:

- `text /gs` -> the local inline catalog suggests `/gsd`;
- `text /skill:create` -> the local inline catalog suggests `/skill:create-skill`;
- second line `/gs` -> autocomplete works without a first-line restriction;
- `/home/spike/file.ts` and `/tmp/log.txt` bypass slash dispatch on submit;
- ordinary text with `/ru-clean` expands the prompt body, including multiple and multiline segments;
- leading `/ru-clean args`, code blocks, inline code, `\\/ru-clean`, missing files, unknown tokens, and skill tokens follow their safe boundaries;
- `/gsd auto`, `/skill:create-skill demo`, and `/unknown` remain on the delegated core submit path.

Detailed coverage and command breakdown: `docs/VERIFICATION.md`.

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

`verify:s03` is the main verification entrypoint. It runs the shipped proof surface and validates the README markers used by the repository guards. More detail: `docs/VERIFICATION.md`.

## Manual `/reload` checklist

<!-- verifier:readme/manual-reload-checklist -->
After loading the extension in Pi, run `/reload` and verify the following scenarios:

- `scenario:inline-gsd-mid-line` -> type `text /gs` and confirm that `/gsd` autocomplete appears.
- `scenario:inline-skill-mid-line` -> type `text /skill:create` and confirm that `/skill:create-skill` appears.
- `scenario:second-line-gsd` -> on the second line type `/gs` and confirm that `/gsd` appears.
- `scenario:inline-prompt-expansion` -> submit ordinary text containing `/ru-clean` and confirm the Markdown body is expanded.
- `scenario:inline-prompt-protection` -> verify leading delegation, code fences, inline code, escapes, missing files, unknown tokens, and skill tokens.
- `scenario:path-home-submit-bypass` -> type `/home/spike/file.ts` and press Enter; expected result is normal user-message behavior without `Unknown command`.
- `scenario:path-tmp-submit-bypass` -> type `/tmp/log.txt` and press Enter; expected result is the same bypass through a normal message.
- `scenario:delegate-gsd-submit` -> on the first line type `/gsd auto` and press Enter; expected result is the normal slash command path.
- `scenario:delegate-skill-submit` -> on the first line type `/skill:create-skill demo` and press Enter; expected result is the normal skill submit path.
- `scenario:delegate-unknown-submit` -> on the first line type `/unknown` and press Enter; expected result is core unknown-command handling, not a normal user message.

<!-- verifier:readme/proven-limitations -->
## Current limitations

- the inline catalog is built only from public `pi.getCommands()` output and does not synthesize a full built-in slash catalog;
- only public sources `extension`, `prompt`, `skill` are accepted;
- prompt expansion is limited to exact whitespace-delimited tokens with no inline arguments;
- prompt files that cannot be read remain literal and produce a compact UI warning when available;
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

## FAQ

### Does this patch Pi core?

No. The extension stays at the extension layer and keeps the standard first-line slash path delegated to core.

### Does it change how unknown slash commands work?

No. `/unknown` intentionally stays on the normal core path.

### Does it expose every built-in slash command inline?

No. The inline catalog is built from public `pi.getCommands()` output only.

## Related docs

- `docs/ARCHITECTURE.md` for runtime wiring and boundaries.
- `docs/VERIFICATION.md` for automated and manual proof.
- `docs/UPSTREAM-SEAMS.md` for the remaining editor/runtime seam request.
