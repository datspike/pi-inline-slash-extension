Нужно реализовать Pi extension в этом проекте, который исправляет два UX-дефекта ввода в Pi / GSD TUI.

Контекст:
1. Slash / skill autocomplete сейчас работает только в начале первой строки сообщения.
2. Если сообщение начинается с абсолютного Linux-пути, например `/home/spike/file.ts`, Pi пытается трактовать это как slash-команду.

Что нужно сделать:
- изучить текущий extension API Pi и возможность кастомного editor через `ctx.ui.setEditorComponent(...)`;
- реализовать extension, который поддерживает slash / skill autocomplete внутри текста, а не только в начале сообщения;
- добавить корректное различение absolute path vs slash command;
- не ломать обычные slash-команды в начале сообщения;
- по возможности обойтись без форка `gsd-build/gsd-2`;
- если без форка невозможно или решение получается хрупким, явно это доказать и подготовить минимальный upstream patch plan.

Ожидаемый результат:
- рабочий extension-код в этом проекте;
- README обновлён по факту реализации;
- есть проверяемые сценарии / тесты / хотя бы чёткий manual verification checklist.

Ключевые сценарии:
- `текст /gsd` -> есть autocomplete
- `текст /skill:create-skill` -> есть autocomplete
- `вторая строка /gsd` -> есть autocomplete
- `/home/spike/file.ts` -> НЕ считается slash-командой
- `/tmp/log.txt` -> НЕ считается slash-командой
- `/gsd auto` -> работает как раньше
- `/skill:create-skill` -> работает как раньше

Где смотреть в установленном gsd-pi:
- `packages/pi-tui/src/autocomplete.ts`
- `packages/pi-tui/src/components/editor.ts`
- `packages/pi-tui/src/__tests__/autocomplete.test.ts`
- `packages/pi-coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/pi-coding-agent/src/modes/interactive/controllers/input-controller.test.ts`
- `packages/pi-coding-agent/src/core/extensions/types.ts`
- `src/resources/skills/create-gsd-extension/references/custom-ui.md`
- `src/resources/skills/create-gsd-extension/references/custom-commands.md`

Что уже известно:
- в core есть явный тест `does not trigger slash commands mid-line`;
- slash context сейчас завязан на начало строки;
- skill-команды регистрируются как `/skill:name`;
- extension API уже позволяет подменять editor;
- существуют внешние editor-extensions, например `pi-vim` и `kostyay/agent-stuff` с `prompt-editor.ts`.

Сначала:
1. прочитай `README.md` в этом проекте;
2. уточни минимальную архитектуру;
3. только потом переходи к коду.
