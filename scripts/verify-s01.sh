#!/usr/bin/env bash
set -euo pipefail

readonly VERIFY_LABEL="verify:s01"
readonly REQUIRED_FILES=(
  ".pi/extensions/inline-slash.ts"
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
- scenario:inline-gsd-mid-line -> введите `текст /gs` и убедитесь, что появляется `/gsd` autocomplete.
- scenario:inline-skill-mid-line -> введите `текст /skill:create` и убедитесь, что появляется `/skill:create-skill`.
- scenario:second-line-gsd -> на второй строке введите `/gs` и убедитесь, что появляется `/gsd`.
- scenario:start-of-line-regression-gsd -> в первой строке введите `/gsd auto` и убедитесь, что стандартный start-of-line сценарий не сломан.
- scenario:start-of-line-regression-skill -> в первой строке введите `/skill:create-skill` и убедитесь, что upstream slash path остаётся рабочим.
- scenario:s02-boundary -> submit-time absolute path `/home/...` намеренно не заявляется здесь и остаётся предметом S02.
CHECKLIST
