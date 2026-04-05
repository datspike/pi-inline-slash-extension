#!/usr/bin/env bash
set -euo pipefail

readonly VERIFY_LABEL="verify:s02"
readonly REQUIRED_FILES=(
  "extensions/inline-slash.ts"
  "src/inline-slash/classifier.ts"
  "src/inline-slash/editor.ts"
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
- scenario:path-home-submit-bypass -> after `/reload`, type `/home/spike/file.ts` and press Enter; expected result is normal user-message behavior without `Unknown command`.
- scenario:path-tmp-submit-bypass -> type `/tmp/log.txt` and press Enter; expected result is the same bypass through a normal message.
- scenario:delegate-gsd-submit -> on the first line type `/gsd auto` and press Enter; expected result is the normal slash command path.
- scenario:delegate-skill-submit -> on the first line type `/skill:create-skill demo` and press Enter; expected result is the normal skill submit path.
- scenario:delegate-unknown-submit -> on the first line type `/unknown` and press Enter; expected result is core unknown-command handling, not a normal user message.
- scenario:start-of-line-first-line-regression -> confirm that first-line start-of-line autocomplete/submit for slash commands is still intact after the path-bypass wiring.
CHECKLIST
