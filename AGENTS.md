# Repo guidance

## Что это за репозиторий
- TypeScript-репозиторий с Pi extension, который добавляет inline slash autocomplete mid-line и на второй строке, а также bypass для leading absolute paths.
- Решение должно оставаться на extension layer: без форка и без локальных патчей Pi core.
- `README.md` фиксирует shipped scope и verification surface. `docs/UPSTREAM-SEAMS.md` хранит только оставшийся upstream seam request.

## Как ориентироваться
- `extensions/inline-slash.ts` - package entrypoint для installable Pi package.
- `.pi/extensions/inline-slash.ts` - project-local shim для auto-discovery; держать тонким реэкспортом package entrypoint.
- `src/inline-slash/command-catalog.ts` - построение публичного inline catalog из `api.getCommands()`.
- `src/inline-slash/provider.ts` - inline slash autocomplete и делегирование start-of-message slash в core provider.
- `src/inline-slash/classifier.ts` - граница submit routing для command vs absolute-path.
- `src/inline-slash/editor.ts` - editor wrapper и изоляция runtime seam редактора.
- `tests/inline-slash/*.test.ts` - основная proof surface.
- `scripts/verify-s01.sh`, `scripts/verify-s02.sh`, `scripts/verify-s03.sh` - shell verifier'ы поверх тестов и README guard'ов.

## Проектные инварианты
- First-line start-of-message slash behavior остаётся delegated core path.
- Bypass разрешён только для absolute path в leading token после `trim()`. Реальные slash-команды и `/unknown` не переводить в user message path.
- Inline catalog строится только из публичных команд `api.getCommands()` и поддерживаемых public sources. Не синтезировать скрытые built-ins без явного изменения scope.
- `extensions/inline-slash.ts` и `.pi/extensions/inline-slash.ts` должны оставаться импортируемыми и эквивалентными по wiring.
- Если нужна новая зависимость на runtime seam редактора, сначала зафиксировать её в `docs/UPSTREAM-SEAMS.md` и покрыть тестом.

## Ожидания от изменений
- После изменений кода запускать `npm run verify:s03`. Для локальной итерации использовать `npm run verify:s01` и `npm run verify:s02`.
- Если меняется поведение, совместимость или verification surface, синхронно обновлять `README.md`, потому что он валидируется скриптами как часть proof.
- Для изменений в реальном TUI-поведении дополнительно проходить manual `/reload` checklist из `README.md`.
- Документация в этом репозитории должна оставаться truth-first: не добавлять гипотезы, варианты или продуктовые обещания без проверяемого proof surface.
