# pi-inline-slash-extension

Shipped extension для Pi / GSD, который добавляет inline slash autocomplete внутри текста и bypass для leading absolute paths без форка core.

<!-- verifier:readme/shipped-scope -->
## Что реально shipped

- inline slash и skill autocomplete работает не только в начале первой строки, но и mid-line и на второй строке;
- leading absolute path вроде `/home/spike/file.ts` и `/tmp/log.txt` уходит как обычное user message, а не как slash-команда;
- start-of-line slash path первой строки остаётся delegated core behavior;
- текущий scope доказан локальными тестами и shell verifier'ами, без upstream patch.

<!-- verifier:readme/architecture -->
## Архитектура

Расширение подключается через `.gsd/extensions/inline-slash.ts` и активируется на `session_start` только при `ctx.hasUI`. Entry point:

1. строит public inline catalog через `buildCommandCatalog(api.getCommands())`;
2. создаёт editor wrapper поверх `CustomEditor` через `createInlineSlashEditorClass(...)`;
3. подключает submit strategy через `createInlineSlashSubmitStrategy(api)`;
4. регистрирует новый editor через `ctx.ui.setEditorComponent(...)`.

Core не патчится: extension расширяет editor/runtime seams поверх публичного API и оставляет штатный first-line slash path в делегированном режиме.

## Как подключить расширение к агенту

### Разовый запуск из checkout этого репозитория

Если хотите проверить поведение без копирования файлов, запустите агент с явным путём к entrypoint:

```bash
gsd --extension "$PWD/.gsd/extensions/inline-slash.ts"
```

После старта откройте UI-сессию и выполните `/reload`, чтобы прогнать сценарии из checklist ниже.

### Постоянное project-local подключение

Pi auto-discovery ищет project-local extensions в `.pi/extensions/`, а не в `.gsd/extensions/`. Для постоянного подключения в этом репозитории удобнее сделать shim или symlink на shipped entrypoint:

```bash
mkdir -p .pi/extensions
ln -sf ../../.gsd/extensions/inline-slash.ts .pi/extensions/inline-slash.ts
```

После этого агент можно запускать обычной командой `gsd`. Если Pi напишет, что project-local extensions пропущены из-за trust gate, сначала доверьте проект, затем перезапустите сессию и выполните `/reload`.

### Подключение через глобальные настройки

Если хотите подключать extension во всех сессиях без `--extension`, добавьте абсолютный путь к entrypoint в глобальный settings файл агента.

#### Для GSD

Глобальный файл настроек:

```json
~/.gsd/agent/settings.json
```

Минимальный пример:

```json
{
  "extensions": [
    "/absolute/path/to/pi-inline-slash-extension/.gsd/extensions/inline-slash.ts"
  ]
}
```

#### Для базового Pi

Если вы запускаете не `gsd`, а базовый `pi`, тот же механизм живёт в другом config dir:

```json
~/.pi/agent/settings.json
```

Минимальный пример:

```json
{
  "extensions": [
    "/absolute/path/to/pi-inline-slash-extension/.gsd/extensions/inline-slash.ts"
  ]
}
```

Замечания:

- используйте именно абсолютный путь;
- если в `settings.json` уже есть другие поля, просто добавьте или расширьте массив `extensions`;
- после изменения глобальных настроек перезапустите агент и выполните `/reload` в UI-сессии.

### Что считать успешным подключением

- агент стартует без ошибки импорта `.gsd/extensions/inline-slash.ts`;
- в UI-сессии после `/reload` работает сценарий `текст /gs` -> появляется `/gsd` autocomplete;
- submit `'/home/spike/file.ts'` больше не идёт в `Unknown command`, а остаётся обычным user message.

<!-- verifier:readme/runtime-seams -->
## Runtime seams

| Файл | Роль в runtime | Что важно для truth-first описания |
| --- | --- | --- |
| `.gsd/extensions/inline-slash.ts` | wiring entrypoint | собирает каталог из `api.getCommands()` и ставит editor wrapper только в UI-сессии |
| `src/inline-slash/command-catalog.ts` | public catalog builder | принимает только public команды из `pi.getCommands()` с source `extension`, `prompt`, `skill`; не притворяется полным built-in catalog |
| `src/inline-slash/editor.ts` | editor wrapper | оборачивает `onSubmit`, прокидывает delegate autocomplete provider и после обычного `handleInput` обновляет inline slash suggestions |
| `src/inline-slash/provider.ts` | autocomplete provider | делегирует start-of-message slash в core provider; mid-line и second-line slash строит из локального каталога |
| `src/inline-slash/classifier.ts` | token classifier | различает command, `skill:*` и absolute-path candidate по текущему токену вокруг курсора |
| `src/inline-slash/submit-routing.ts` | pure submit boundary | после `trim()` смотрит только на leading token и решает `delegate-core-submit` vs `send-user-message` |
| `src/inline-slash/extension-submit-strategy.ts` | runtime submit shim | для absolute path добавляет запись в history и вызывает `sendUserMessage`; всё остальное отдаёт в core submit |

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
  - loader-faithful smoke test импортирует `.gsd/extensions/inline-slash.ts` и проверяет wiring до `setEditorComponent`.

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

`verify:s03` - единый discoverable entrypoint для этой milestone surface. Он композиционно прогоняет уже существующие proof surfaces и затем валидирует README markers.

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
- first-line start-of-message slash autocomplete остаётся delegated core behavior, а не локальной заменой core provider;
- submit bypass смотрит только на leading token после `trim()`: абсолютный путь в начале сообщения bypass'ится, остальные случаи идут в `delegate-core-submit`;
- `/unknown` намеренно остаётся delegated core unknown-command handling;
- extension требует `sendUserMessage` только для absolute path bypass; отсутствие этого API считается wiring failure и падает явно;
- extension не меняет core semantics для обычного текста и пустого submit.

<!-- verifier:readme/upstream-patch-plan -->
## Upstream patch plan

Для shipped scope upstream patch сейчас не требуется. Текущая реализация и tests доказывают нужное поведение на extension layer.

Повод возвращаться к upstream patch появится только если future scope потребует хотя бы одно из следующего:

- inline autocomplete для built-in команд, которых нет в public `pi.getCommands()`;
- изменение core unknown-command handling для `/unknown`;
- изменение штатного first-line slash behavior вместо делегирования в core.
