#!/usr/bin/env bash
set -euo pipefail

readonly VERIFY_LABEL="verify:s01"
readonly REQUIRED_FILES=(
  "extensions/inline-slash.ts"
  "src/inline-slash/editor.ts"
  "tests/inline-slash/editor-smoke.test.ts"
  "tests/inline-slash/provider.test.ts"
  "tests/inline-slash/command-catalog.test.ts"
  "tests/inline-slash/classifier.test.ts"
)

fail() {
  echo "[s01] broken entrypoint/wiring: $1" >&2
  exit 1
}

for required_file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    fail "missing required file '$required_file'"
  fi
done

echo "[s01] running automated smoke suite via npm run ${VERIFY_LABEL}"
npm run "$VERIFY_LABEL"

echo
cat <<'CHECKLIST'
[s01] live /reload checklist
- scenario:inline-gsd-mid-line -> type `text /gs` and confirm that `/gsd` autocomplete appears.
- scenario:inline-skill-mid-line -> type `text /skill:create` and confirm that `/skill:create-skill` appears.
- scenario:second-line-gsd -> on the second line type `/gs` and confirm that `/gsd` appears.
- scenario:inline-prompt-expansion -> submit ordinary text containing `/ru-clean` and confirm the Markdown body is expanded.
- scenario:inline-prompt-protection -> verify leading delegation, code fences, inline code, escapes, missing files, unknown tokens, and skill tokens.
- scenario:start-of-line-regression-gsd -> on the first line type `/gsd auto` and confirm the standard start-of-line scenario is still intact.
- scenario:start-of-line-regression-skill -> on the first line type `/skill:create-skill` and confirm the upstream slash path still works.
- scenario:s02-boundary -> submit-time absolute path `/home/...` is intentionally not claimed here and remains covered by S02.
CHECKLIST
