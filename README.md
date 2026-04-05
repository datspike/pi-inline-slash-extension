# pi-inline-slash-extension

Shipped extension для Pi, который добавляет inline slash autocomplete внутри текста и bypass для leading absolute paths без форка core.

<!-- verifier:readme/shipped-scope -->
## Что реально shipped

- inline slash и skill autocomplete работает не только в начале первой строки, но и mid-line и на второй строке;
- leading absolute path вроде `/home/spike/file.ts` и `/tmp/log.txt` уходит как обычное user message, а не как slash-команда;
- start-of-line slash path первой строки остаётся delegated core behavior;
- текущий scope доказан локальными тестами и shell verifier'ами, без upstream patch.

## Два режима использования

### Local workaround

Основной практический режим для этого репозитория - project-local workaround через `.pi/extensions/inline-slash.ts`. Он удобен, если нужна узкая правка UX без ожидания изменений в Pi core.

### Ecosystem package

Дополнительно extension оформлен как Pi package entrypoint через `extensions/inline-slash.ts` и `package.json -> pi.extensions`. Это делает пакет installable для P-экосистемы, но не отменяет того факта, что inline autocomplete всё ещё зависит от части runtime seam редактора, которая пока не оформлена как стабильный публичный API.

<!-- verifier:readme/architecture -->
## Архитектура

Расширение подключается через package entrypoint `extensions/inline-slash.ts`, а project-local shim `.pi/extensions/inline-slash.ts` только реэкспортирует его. Активация идёт на `session_start` только при `ctx.hasUI`.

Entry point:

1. строит public inline catalog через `buildCommandCatalog(api.getCommands())`;
2. создаёт editor wrapper поверх `CustomEditor` через `createInlineSlashEditorClass(...)`;
3. подключает submit strategy через `createInlineSlashSubmitStrategy(api)`;
4. регистрирует новый editor через `ctx.ui.setEditorComponent(...)`.

Core не патчится: extension расширяет editor/runtime seam поверх публичного API и оставляет штатный first-line slash path в делегированном режиме.

## Как подключить расширение к Pi

### Project-local подключение

Pi auto-discovery ищет project-local extensions в `.pi/extensions/`. В этом репозитории shipped shim уже лежит по нужному пути:

```bash
pi
```

После старта откройте UI-сессию и выполните `/reload`, чтобы прогнать сценарии из checklist ниже.

### Установка как Pi package

Package entrypoint расположен в `extensions/inline-slash.ts`, а в `package.json` объявлен `pi.extensions` manifest. Локальная установка:

```bash
pi install /absolute/path/to/pi-inline-slash-extension
```

Или project-local через `.pi/settings.json`:

```json
{
  "packages": [
    "/absolute/path/to/pi-inline-slash-extension"
  ]
}
```

### Глобальное подключение абсолютным путём

Если нужен прямой путь без `pi install`, можно оставить extension в глобальном settings файле Pi:

```json
~/.pi/agent/settings.json
```

Минимальный пример:

```json
{
  "extensions": [
    "/absolute/path/to/pi-inline-slash-extension/extensions/inline-slash.ts"
  ]
}
```

### Что считать успешным подключением

- агент стартует без ошибки импорта `extensions/inline-slash.ts` или `.pi/extensions/inline-slash.ts`;
- в UI-сессии после `/reload` работает сценарий `текст /gs` -> появляется `/gsd` autocomplete;
- submit `'/home/spike/file.ts'` больше не идёт в `Unknown command`, а остаётся обычным user message.

<!-- verifier:readme/runtime-seams -->
## Runtime seams

| Файл | Роль в runtime | Что важно для truth-first описания |
| --- | --- | --- |
| `extensions/inline-slash.ts` | package entrypoint | installable entrypoint для Pi package и глобального подключения |
| `.pi/extensions/inline-slash.ts` | project-local shim | project-local auto-discovery seam; только реэкспорт package entrypoint |
| `src/inline-slash/command-catalog.ts` | public catalog builder | принимает только public команды из `pi.getCommands()` с source `extension`, `prompt`, `skill`; использует `sourceInfo` как канонический provenance contract |
| `src/inline-slash/editor.ts` | editor wrapper | оборачивает `onSubmit`, прокидывает delegate autocomplete provider и после обычного `handleInput` обновляет inline slash suggestions |
| `src/inline-slash/provider.ts` | autocomplete provider | делегирует start-of-message slash в core provider; mid-line и second-line slash строит из локального каталога |
| `src/inline-slash/classifier.ts` | token classifier и submit boundary | различает command, `skill:*` и absolute-path candidate по текущему токену вокруг курсора; после `trim()` смотрит только на leading token и решает `delegate-core-submit` vs `send-user-message` |
| `src/inline-slash/editor.ts` | runtime submit shim | `createInlineSlashSubmitStrategy` для absolute path добавляет запись в history и вызывает `sendUserMessage`; всё остальное отдаёт в core submit |
| `docs/UPSTREAM-SEAMS.md` | upstream seam request | фиксирует минимальный публичный API, который нужен, чтобы убрать оставшуюся зависимость от editor internals |

## Текущее состояние зависимости от Pi runtime

Стабильная часть решения держится на публичных seams:

- `ctx.ui.setEditorComponent(...)`;
- `CustomEditor`;
- `pi.getCommands()`;
- `sendUserMessage(...)`;
- публичные методы редактора `getText()`, `getLines()`, `getCursor()`, `setAutocompleteProvider()`.

Оставшаяся хрупкость изолирована в одном месте: `src/inline-slash/editor.ts` всё ещё форсирует refresh autocomplete через runtime методы редактора, которые не задокументированы как extension contract. Зависимость сокращена до минимального набора hooks и больше не использует `state` редактора.

<!-- verifier:readme/verified-scenarios -->
## Verified scenarios

### Automated proof

Автоматические проверки покрывают три слоя:

- `tests/inline-slash/provider.test.ts`
  - `inline-gsd`, `inline-skill`, `second-line-gsd`;
  - suppression для absolute paths;
  - delegated first-line behavior;
  - safe no-op на malformed bounds.
- `tests/inline-slash/submit-routing.test.ts`
  - bypass для `/home/...` и `/tmp/...`;
  - delegated submit для `/gsd auto`, `/skill:create-skill demo`, `/unknown`, обычного текста и пустого буфера;
  - routing смотрит только на leading token после `trim()`.
- `tests/inline-slash/editor-smoke.test.ts`
  - обычный typing cycle реально обновляет autocomplete на второй строке и mid-line;
  - submit strategy вызывает `sendUserMessage` только для leading absolute path;
  - smoke tests импортируют и `extensions/inline-slash.ts`, и `.pi/extensions/inline-slash.ts`, а затем проверяют wiring до `setEditorComponent`.

### Что именно считается доказанным

- `текст /gs` -> локальный inline catalog предлагает `/gsd`;
- `текст /skill:create` -> локальный inline catalog предлагает `/skill:create-skill`;
- вторая строка `/gs` -> autocomplete работает без first-line ограничения;
- `/home/spike/file.ts` и `/tmp/log.txt` при submit bypass'ят slash dispatch;
- `/gsd auto`, `/skill:create-skill demo` и `/unknown` остаются delegated core submit path.

<!-- verifier:readme/verification-commands -->
## Verification surface

### Top-level

```bash
npm run verify:s03
bash scripts/verify-s03.sh
```

`verify:s03` - единый discoverable entrypoint для этой verification surface. Он композиционно прогоняет уже существующие proof surfaces и затем валидирует README markers.

### Drill-down

```bash
npm run verify:s01
bash scripts/verify-s01.sh
npm run verify:s02
bash scripts/verify-s02.sh
```

- `verify:s01` - inline autocomplete, catalog и provider proof;
- `verify:s02` - submit routing, editor smoke и `tsc --noEmit`;
- `verify:s03` - orchestration поверх S01/S02 плюс README guard.

Automated proof и live runtime proof намеренно разделены: команды выше подтверждают кодовые инварианты, а ручной `/reload` checklist ниже подтверждает поведение в настоящем TUI.

<!-- verifier:readme/manual-reload-checklist -->
## Manual `/reload` checklist

После загрузки extension в Pi выполните `/reload` и проверьте следующие сценарии:

- `scenario:inline-gsd-mid-line` -> введите `текст /gs` и убедитесь, что появляется `/gsd` autocomplete.
- `scenario:inline-skill-mid-line` -> введите `текст /skill:create` и убедитесь, что появляется `/skill:create-skill`.
- `scenario:second-line-gsd` -> на второй строке введите `/gs` и убедитесь, что появляется `/gsd`.
- `scenario:path-home-submit-bypass` -> введите `/home/spike/file.ts` и отправьте Enter; ожидается обычное user message поведение без `Unknown command`.
- `scenario:path-tmp-submit-bypass` -> введите `/tmp/log.txt` и отправьте Enter; ожидается тот же bypass через обычное сообщение.
- `scenario:delegate-gsd-submit` -> в первой строке введите `/gsd auto` и отправьте Enter; ожидается штатный slash command path.
- `scenario:delegate-skill-submit` -> в первой строке введите `/skill:create-skill demo` и отправьте Enter; ожидается штатный skill submit path.
- `scenario:delegate-unknown-submit` -> в первой строке введите `/unknown` и отправьте Enter; ожидается core unknown-command handling, а не обычное user message.

<!-- verifier:readme/proven-limitations -->
## Proven limitations and boundaries

- inline catalog строится только из public `pi.getCommands()`; extension не синтезирует и не обещает полный built-in slash catalog;
- локальный каталог принимает только public sources `extension`, `prompt`, `skill`;
- `sourceInfo` используется как единственный канонический provenance contract;
- first-line start-of-message slash autocomplete остаётся delegated core behavior, а не локальной заменой core provider;
- submit bypass смотрит только на leading token после `trim()`: абсолютный путь в начале сообщения bypass'ится, остальные случаи идут в `delegate-core-submit`;
- `/unknown` намеренно остаётся delegated core unknown-command handling;
- extension требует `sendUserMessage` только для absolute path bypass; отсутствие этого API считается wiring failure и падает явно;
- package installability не равна полной API-стабильности: inline refresh всё ещё зависит от ограниченного runtime seam редактора;
- compatibility SLA описан ниже и сознательно уже, чем у чисто публичного extension API.

## Compatibility SLA

- рабочий и проверенный baseline: `@mariozechner/pi-coding-agent` `^0.65.0`;
- extension обещает стабильность shipped scope только пока доступны публичные seams `setEditorComponent`, `CustomEditor`, `pi.getCommands()`, `sendUserMessage`, `getLines`, `getCursor`, `setAutocompleteProvider`;
- при изменении runtime editor seam inline refresh может деградировать до отсутствия mid-line popup, но submit boundary для absolute paths и project/package wiring должны оставаться детектируемыми тестами;
- любое расширение scope за пределы shipped behavior требует отдельной перепроверки против новых версий Pi.

<!-- verifier:readme/upstream-patch-plan -->
## Upstream patch plan

Для shipped scope upstream patch в core по-прежнему не требуется. Текущая реализация и tests доказывают нужное поведение на extension layer.

Но для product-grade package нужен маленький upstream patch: публичный editor seam для `open/refresh/close autocomplete` и, отдельно, hook перед slash dispatch для submit boundary. Детали вынесены в `docs/UPSTREAM-SEAMS.md`.

Повод возвращаться к upstream patch появится хотя бы при одном из следующих требований:

- inline autocomplete для built-in команд, которых нет в public `pi.getCommands()`;
- изменение core unknown-command handling для `/unknown`;
- изменение штатного first-line slash behavior вместо делегирования в core;
- отказ от оставшейся зависимости на runtime editor internals ради более надёжного package-level compatibility.
