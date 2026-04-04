#!/usr/bin/env bash
set -euo pipefail

readonly VERIFY_LABEL="verify:s03"
readonly INLINE_AUTOCOMPLETE_LABEL="verify:s01"
readonly SUBMIT_BOUNDARY_LABEL="verify:s02"
readonly REQUIRED_FILES=(
  "README.md"
  "package.json"
  ".gsd/extensions/inline-slash.ts"
  "src/inline-slash/classifier.ts"
  "src/inline-slash/command-catalog.ts"
  "src/inline-slash/editor.ts"
  "src/inline-slash/extension-submit-strategy.ts"
  "src/inline-slash/provider.ts"
  "src/inline-slash/submit-routing.ts"
  "tests/inline-slash/editor-smoke.test.ts"
  "tests/inline-slash/provider.test.ts"
  "tests/inline-slash/submit-routing.test.ts"
  "scripts/verify-s01.sh"
  "scripts/verify-s02.sh"
  "scripts/verify-s03.sh"
)

fail() {
  echo "[s03] verification surface broken: $1" >&2
  exit 1
}

require_fixed_pattern() {
  local pattern="$1"
  local description="$2"

  if ! rg -F -q -- "$pattern" README.md; then
    fail "README.md: отсутствует ${description} (${pattern})"
  fi
}

forbid_pattern() {
  local pattern="$1"
  local description="$2"

  if rg -q -- "$pattern" README.md; then
    fail "README.md: найден устаревший ${description} (${pattern})"
  fi
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

forbid_pattern "Гипотеза реализации" "speculative section"
forbid_pattern "Вариант A" "speculative option A"
forbid_pattern "Вариант B" "speculative option B"

require_fixed_pattern "<!-- verifier:readme/shipped-scope -->" "marker shipped-scope"
require_fixed_pattern "<!-- verifier:readme/architecture -->" "marker architecture"
require_fixed_pattern "<!-- verifier:readme/runtime-seams -->" "marker runtime-seams"
require_fixed_pattern "<!-- verifier:readme/verified-scenarios -->" "marker verified-scenarios"
require_fixed_pattern "<!-- verifier:readme/verification-commands -->" "marker verification-commands"
require_fixed_pattern '## Manual `/reload` checklist' "manual runtime proof section"
require_fixed_pattern "<!-- verifier:readme/manual-reload-checklist -->" "marker manual-reload-checklist"
require_fixed_pattern "<!-- verifier:readme/proven-limitations -->" "marker proven-limitations"
require_fixed_pattern "<!-- verifier:readme/upstream-patch-plan -->" "marker upstream-patch-plan"

require_fixed_pattern '`.gsd/extensions/inline-slash.ts`' "entrypoint seam"
require_fixed_pattern '`src/inline-slash/editor.ts`' "editor seam"
require_fixed_pattern '`src/inline-slash/command-catalog.ts`' "command catalog seam"
require_fixed_pattern '`src/inline-slash/submit-routing.ts`' "submit routing seam"
require_fixed_pattern '`src/inline-slash/extension-submit-strategy.ts`' "submit strategy seam"
require_fixed_pattern '`pi.getCommands()`' "public catalog boundary"
require_fixed_pattern '`/unknown`' "unknown-command boundary"
require_fixed_pattern 'upstream patch' "upstream patch statement"
require_fixed_pattern '`sendUserMessage`' "absolute-path transport boundary"

require_fixed_pattern 'npm run verify:s01' "top-level drill-down command verify:s01"
require_fixed_pattern 'npm run verify:s02' "top-level drill-down command verify:s02"
require_fixed_pattern 'npm run verify:s03' "top-level verification command verify:s03"
require_fixed_pattern 'bash scripts/verify-s01.sh' "drill-down shell verifier s01"
require_fixed_pattern 'bash scripts/verify-s02.sh' "drill-down shell verifier s02"
require_fixed_pattern 'bash scripts/verify-s03.sh' "top-level shell verifier s03"

require_fixed_pattern 'scenario:inline-gsd-mid-line' "manual checklist scenario inline-gsd-mid-line"
require_fixed_pattern 'scenario:inline-skill-mid-line' "manual checklist scenario inline-skill-mid-line"
require_fixed_pattern 'scenario:second-line-gsd' "manual checklist scenario second-line-gsd"
require_fixed_pattern 'scenario:path-home-submit-bypass' "manual checklist scenario path-home-submit-bypass"
require_fixed_pattern 'scenario:path-tmp-submit-bypass' "manual checklist scenario path-tmp-submit-bypass"
require_fixed_pattern 'scenario:delegate-gsd-submit' "manual checklist scenario delegate-gsd-submit"
require_fixed_pattern 'scenario:delegate-skill-submit' "manual checklist scenario delegate-skill-submit"
require_fixed_pattern 'scenario:delegate-unknown-submit' "manual checklist scenario delegate-unknown-submit"

echo "[s03] README markers validated"
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
