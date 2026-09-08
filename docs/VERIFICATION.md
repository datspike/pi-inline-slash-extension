# Verification

## Main command

Use the top-level verifier:

```bash
npm run verify:s03
bash scripts/verify-s03.sh
```

`verify:s03` is the main verification entrypoint. It validates the README markers and runs the shipped proof surface.

## Drill-down commands

```bash
npm run verify:s01
bash scripts/verify-s01.sh
npm run verify:s02
bash scripts/verify-s02.sh
```

- `verify:s01` covers inline autocomplete, catalog construction, prompt expansion, and provider behavior.
- `verify:s02` covers submit routing, editor smoke checks, and `tsc --noEmit`.
- `verify:s03` composes the full proof surface and README guard.

## Automated proof

The repository currently proves these user-facing scenarios:

`/ru-clean` is a representative loaded prompt used by the checks; it is not bundled with this package.

- `text /gs` suggests `/gsd`;
- `text /skill:create` suggests `/skill:create-skill`;
- slash autocomplete works on the second line;
- public prompt bodies expand for exact mid-line and multiline tokens, including multiple segments;
- leading prompt invocations remain delegated, while fenced code, inline code, escapes, missing files, unknown tokens, and skills stay safe;
- `/home/spike/file.ts` and `/tmp/log.txt` bypass slash dispatch on submit;
- `/gsd auto`, `/skill:create-skill demo`, and `/unknown` stay on the delegated core submit path.

The automated coverage lives in:

- `tests/inline-slash/provider.test.ts`
- `tests/inline-slash/prompt-expansion.test.ts`
- `tests/inline-slash/submit-routing.test.ts`
- `tests/inline-slash/editor-smoke.test.ts`

## Manual `/reload` checklist

After loading the extension in Pi, run `/reload` and verify:

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
