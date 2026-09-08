#!/usr/bin/env bash
set -euo pipefail

readonly VERIFY_LABEL="verify:s03"
readonly INLINE_AUTOCOMPLETE_LABEL="verify:s01"
readonly SUBMIT_BOUNDARY_LABEL="verify:s02"
readonly REQUIRED_FILES=(
  "README.md"
  "package.json"
  "extensions/inline-slash.ts"
  "docs/UPSTREAM-SEAMS.md"
  "src/inline-slash/classifier.ts"
  "src/inline-slash/command-catalog.ts"
  "src/inline-slash/editor.ts"
  "src/inline-slash/provider.ts"
  "src/inline-slash/prompt-expansion.ts"
  "tests/inline-slash/prompt-expansion.test.ts"
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

  if ! grep -F -q -- "$pattern" README.md; then
    fail "README.md: missing ${description} (${pattern})"
  fi
}

forbid_pattern() {
  local pattern="$1"
  local description="$2"

  if grep -F -q -- "$pattern" README.md; then
    fail "README.md: found outdated ${description} (${pattern})"
  fi
}

for required_file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    fail "missing required file '$required_file'"
  fi
done

if ! grep -F -q '"verify:s01"' package.json; then
  fail "missing package.json script 'verify:s01'"
fi

if ! grep -F -q '"verify:s02"' package.json; then
  fail "missing package.json script 'verify:s02'"
fi

if ! grep -F -q '"verify:s03"' package.json; then
  fail "missing package.json script 'verify:s03'"
fi

forbid_pattern "Implementation hypothesis" "speculative section"
forbid_pattern "Option A" "speculative option A"
forbid_pattern "Option B" "speculative option B"
forbid_pattern '@gsd/pi-coding-agent' "legacy gsd package mention"
forbid_pattern '`.gsd/extensions/inline-slash.ts`' "legacy gsd entrypoint mention"

require_fixed_pattern "<!-- verifier:readme/shipped-scope -->" "marker shipped-scope"
require_fixed_pattern "<!-- verifier:readme/architecture -->" "marker architecture"
require_fixed_pattern "<!-- verifier:readme/runtime-seams -->" "marker runtime-seams"
require_fixed_pattern "<!-- verifier:readme/verified-scenarios -->" "marker verified-scenarios"
require_fixed_pattern "<!-- verifier:readme/verification-commands -->" "marker verification-commands"
require_fixed_pattern '## Manual `/reload` checklist' "manual runtime proof section"
require_fixed_pattern "<!-- verifier:readme/manual-reload-checklist -->" "marker manual-reload-checklist"
require_fixed_pattern "<!-- verifier:readme/proven-limitations -->" "marker proven-limitations"
require_fixed_pattern "<!-- verifier:readme/upstream-patch-plan -->" "marker upstream-patch-plan"

require_fixed_pattern '`extensions/inline-slash.ts`' "package entrypoint seam"
require_fixed_pattern '`src/inline-slash/editor.ts`' "editor seam"
require_fixed_pattern '`src/inline-slash/command-catalog.ts`' "command catalog seam"
require_fixed_pattern '`src/inline-slash/classifier.ts`' "submit routing seam"
require_fixed_pattern '`createInlineSlashSubmitStrategy`' "submit strategy seam"
require_fixed_pattern '`pi.getCommands()`' "public catalog boundary"
require_fixed_pattern '`sourceInfo`' "public provenance boundary"
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
require_fixed_pattern 'scenario:inline-prompt-expansion' "manual checklist scenario inline-prompt-expansion"
require_fixed_pattern 'scenario:inline-prompt-protection' "manual checklist scenario inline-prompt-protection"
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
echo "[s03] submit-boundary proof -> npm run ${SUBMIT_BOUNDARY_LABEL}"
npm run "$SUBMIT_BOUNDARY_LABEL"

echo
echo "[s03] drill-down surfaces: npm run ${INLINE_AUTOCOMPLETE_LABEL} | bash scripts/verify-s01.sh | npm run ${SUBMIT_BOUNDARY_LABEL} | bash scripts/verify-s02.sh"
echo
cat <<'CHECKLIST'
[s03] live /reload checklist
- scenario:inline-gsd-mid-line -> type `text /gs` and confirm that `/gsd` autocomplete appears.
- scenario:inline-skill-mid-line -> type `text /skill:create` and confirm that `/skill:create-skill` appears.
- scenario:second-line-gsd -> on the second line type `/gs` and confirm that `/gsd` appears.
- scenario:inline-prompt-expansion -> submit ordinary text containing `/ru-clean` and confirm the public prompt body is expanded.
- scenario:inline-prompt-protection -> confirm fenced code, inline code, escapes, and a leading `/prompt` invocation remain safe.
- scenario:path-home-submit-bypass -> type `/home/spike/file.ts` and press Enter; expected result is normal user-message behavior without `Unknown command`.
- scenario:path-tmp-submit-bypass -> type `/tmp/log.txt` and press Enter; expected result is the same bypass through a normal message.
- scenario:delegate-gsd-submit -> on the first line type `/gsd auto` and press Enter; expected result is the normal slash command path.
- scenario:delegate-skill-submit -> on the first line type `/skill:create-skill demo` and press Enter; expected result is the normal skill submit path.
- scenario:delegate-unknown-submit -> on the first line type `/unknown` and press Enter; expected result is core unknown-command handling, not a normal user message.
CHECKLIST
