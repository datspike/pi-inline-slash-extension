# upstream editor seam request

## Зачем

Текущее расширение решает shipped-задачу без форка core, но для inline slash autocomplete всё ещё вынуждено обращаться к части runtime seam редактора, которая не описана как публичный extension contract.

## Что уже держится на публичном API

- `ctx.ui.setEditorComponent(...)`
- `CustomEditor`
- `api.getCommands()`
- `api.sendUserMessage(...)`
- `Editor.getText()`
- `Editor.getLines()`
- `Editor.getCursor()`
- `Editor.setAutocompleteProvider(...)`

## Что сейчас остаётся серой зоной

- форсированный запуск autocomplete после mid-line ввода;
- обновление уже открытого autocomplete popup вне start-of-message slash flow;
- submit interception до того, как slash dispatcher решит, что `/home/...` - это команда.

## Минимальный публичный seam

### editor autocomplete control

Нужен публичный контракт уровня `CustomEditor` или `EditorComponent`:

- `refreshAutocomplete(): void`
- `openAutocomplete(): void`
- `closeAutocomplete(): void`
- `isAutocompleteOpen(): boolean`

Этого достаточно, чтобы extension не трогал private методы редактора.

### submit classification hook

Нужен extension hook до slash dispatch:

- `before_submit_dispatch(text) -> { route: "default" | "send-user-message" }`

или более узкий editor-level callback:

- `transformSubmit(text) -> { kind: "delegate" | "user-message", text: string }`

## Что даст такой seam

- расширение перестанет зависеть от private editor internals;
- inline slash станет переносимым между версиями Pi;
- можно будет расширить каталог до built-ins только после отдельного публичного API на built-in commands;
- логика package-level extensions станет предсказуемой для всей P-экосистемы.

## Что не просим в этом patch

- built-in slash catalog через `pi.getCommands()`;
- изменение unknown-command semantics;
- переписывание текущего slash UX целиком.
