#!/usr/bin/env bash
set -euo pipefail

readonly VERIFY_LABEL="verify:s02"
readonly REQUIRED_FILES=(
  ".gsd/extensions/inline-slash.ts"
  "src/inline-slash/editor.ts"
  "src/inline-slash/extension-submit-strategy.ts"
  "tests/inline-slash/editor-smoke.test.ts"
  "tests/inline-slash/submit-routing.test.ts"
  "scripts/verify-s02.sh"
)

fail() {
  echo "[s02] broken submit boundary: $1" >&2
  exit 1
}

for required_file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    fail "missing required file '$required_file'"
  fi
done

echo "[s02] running automated submit boundary verifier via npm run ${VERIFY_LABEL}"
npm run "$VERIFY_LABEL"

echo
cat <<'CHECKLIST'
[s02] live /reload checklist
- scenario:path-home-submit-bypass -> после `/reload` введите `/home/spike/file.ts` и отправьте Enter; ожидается обычное user message поведение без `Unknown command`.
- scenario:path-tmp-submit-bypass -> введите `/tmp/log.txt` и отправьте Enter; ожидается тот же bypass через обычное сообщение.
- scenario:delegate-gsd-submit -> в первой строке введите `/gsd auto` и отправьте Enter; ожидается штатный slash command path.
- scenario:delegate-skill-submit -> в первой строке введите `/skill:create-skill demo` и отправьте Enter; ожидается штатный skill submit path.
- scenario:delegate-unknown-submit -> в первой строке введите `/unknown` и отправьте Enter; ожидается core unknown-command handling, а не обычное user message.
- scenario:start-of-line-first-line-regression -> убедитесь, что start-of-line autocomplete/submit на первой строке для slash-команд не сломан после path bypass wiring.
CHECKLIST
