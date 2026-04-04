#!/usr/bin/env bash
set -euo pipefail

readonly VERIFY_LABEL="verify:s03"
readonly INLINE_AUTOCOMPLETE_LABEL="verify:s01"
readonly SUBMIT_BOUNDARY_LABEL="verify:s02"
readonly REQUIRED_FILES=(
  "package.json"
  ".gsd/extensions/inline-slash.ts"
  "src/inline-slash/editor.ts"
  "src/inline-slash/extension-submit-strategy.ts"
  "tests/inline-slash/editor-smoke.test.ts"
  "tests/inline-slash/provider.test.ts"
  "tests/inline-slash/submit-routing.test.ts"
  "scripts/verify-s01.sh"
  "scripts/verify-s02.sh"
  "scripts/verify-s03.sh"
)

fail() {
  echo "[s03] final verification surface broken: $1" >&2
  exit 1
}

for required_file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    fail "missing required file '$required_file'"
  fi
done

if ! rg -q '"verify:s01"' package.json; then
  fail "missing package.json script 'verify:s01'"
fi

if ! rg -q '"verify:s02"' package.json; then
  fail "missing package.json script 'verify:s02'"
fi

if ! rg -q '"verify:s03"' package.json; then
  fail "missing package.json script 'verify:s03'"
fi

echo "[s03] running milestone verification surface via npm run ${VERIFY_LABEL}"
echo "[s03] inline autocomplete proof -> npm run ${INLINE_AUTOCOMPLETE_LABEL}"
npm run "$INLINE_AUTOCOMPLETE_LABEL"

echo
echo "[s03] submit-routing proof -> npm run ${SUBMIT_BOUNDARY_LABEL}"
npm run "$SUBMIT_BOUNDARY_LABEL"

echo
echo "[s03] drill-down surfaces: npm run ${INLINE_AUTOCOMPLETE_LABEL} | bash scripts/verify-s01.sh | npm run ${SUBMIT_BOUNDARY_LABEL} | bash scripts/verify-s02.sh"
echo
cat <<'CHECKLIST'
[s03] live /reload checklist
- scenario:inline-gsd-mid-line -> введите `текст /gs` и убедитесь, что появляется `/gsd` autocomplete.
- scenario:inline-skill-mid-line -> введите `текст /skill:create` и убедитесь, что появляется `/skill:create-skill`.
- scenario:second-line-gsd -> на второй строке введите `/gs` и убедитесь, что появляется `/gsd`.
- scenario:path-home-submit-bypass -> введите `/home/spike/file.ts` и отправьте Enter; ожидается обычное user message поведение без `Unknown command`.
- scenario:path-tmp-submit-bypass -> введите `/tmp/log.txt` и отправьте Enter; ожидается тот же bypass через обычное сообщение.
- scenario:delegate-gsd-submit -> в первой строке введите `/gsd auto` и отправьте Enter; ожидается штатный slash command path.
- scenario:delegate-skill-submit -> в первой строке введите `/skill:create-skill demo` и отправьте Enter; ожидается штатный skill submit path.
- scenario:delegate-unknown-submit -> в первой строке введите `/unknown` и отправьте Enter; ожидается core unknown-command handling, а не обычное user message.
CHECKLIST
