# pi-inline-slash-extension

Расширение для Pi / GSD, которое исправляет два раздражающих ограничения ввода в TUI.

## Проблемы

### 1. Slash / skill autocomplete работает только в начале сообщения

Сейчас slash-autocomplete в Pi фактически ограничен началом первой строки редактора.
Из-за этого команды и skill-команды приходится вводить руками, если они появляются не в самом начале сообщения.

Примеры желаемого поведения:
- `Сначала посмотри логи, потом /gsd doctor fix`
- `Нужно включить навык /skill:create-skill и продолжить`
- `Сравни это с /gsd help`

### 2. Абсолютный Linux-путь в начале сообщения ошибочно воспринимается как slash-команда

Если сообщение начинается с абсолютного пути, например:
- `/home/spike/project/file.ts`
- `/tmp/log.txt`
- `/.config/app/config.json`

TUI пытается трактовать это как slash-команду, а не как путь к файлу. Это ломает UX и мешает нормальному вводу.

## Цель

Сделать расширение, которое:
- разрешает slash-autocomplete не только в начале сообщения, но и внутри текста;
- не путает абсолютные Linux-пути со slash-командами;
- по возможности не требует форка `gsd-build/gsd-2`;
- использует extension API Pi и кастомный editor, если этого достаточно.

## Что уже известно

По установленному `gsd-pi` и коду `gsd-build/gsd-2`:

- `packages/pi-tui/src/autocomplete.ts`
  - slash suggestions включаются только если `textBeforeCursor.startsWith("/")`;
- `packages/pi-tui/src/components/editor.ts`
  - slash menu разрешён только на первой строке;
  - slash context проверяется как начало строки после `trimStart()`;
- `packages/pi-tui/src/__tests__/autocomplete.test.ts`
  - есть явный тест `does not trigger slash commands mid-line`;
- skill-команды сейчас регистрируются как `/skill:name`, а не как bare `/<skill>`.

## Гипотеза реализации

### Вариант A — extension без форка

Сделать кастомный editor через `ctx.ui.setEditorComponent(...)`, который:
- перехватывает текущий текст и позицию курсора;
- выделяет текущий token вида `/...` не только в начале строки, но и после разделителя;
- показывает dropdown для slash / skill completion внутри текста;
- если token выглядит как абсолютный путь (`/home/...`, `/tmp/...`, `/.config/...`, любой `/segment/...` с повторным `/` до пробела), не включает режим slash-команды.

Плюсы:
- не надо патчить ядро;
- можно выпустить как независимое расширение.

Минусы:
- логика editor-level autocomplete будет сложнее;
- возможно придётся дублировать часть поведения core autocomplete.

### Вариант B — upstream patch

Если extension-путь окажется слишком хрупким, патчить upstream:
- `packages/pi-tui/src/autocomplete.ts`
- `packages/pi-tui/src/components/editor.ts`
- тесты autocomplete / editor

Но это уже отдельная ветка работы.

## Минимальные требования к поведению

### Slash внутри текста

Должно работать:
- `текст /gsd`
- `текст /skill:create-skill`
- `текст\nвторая строка /gsd`

### Абсолютные пути

Не должно считаться командой:
- `/home/spike/file.ts`
- `/tmp/test.log`
- `/.config/nvim/init.lua`
- `/var/log/syslog`

### Команды по-прежнему должны работать

Не ломаем:
- `/gsd`
- `/gsd auto`
- `/skill:create-skill`
- `/model`
- `/thinking`

## Идеи для эвристики различения command vs path

Базовая идея:
- если token начинается с `/` и до первого пробела содержит второй `/`, это кандидат в абсолютный путь, а не в slash-команду;
- исключение: известные slash-команды и `command:arg`-формы вроде `/skill:create-skill`;
- если token совпадает с известной командой или её префиксом без дополнительного `/`, это slash-команда;
- если token похож на filesystem path, отдаём его path/autocomplete-логике.

Черновое правило:
- slash-команда: `/gsd`, `/skill:create-skill`, `/model`, `/thinking high`
- путь: `/home/spike/x`, `/tmp/x`, `/usr/bin/env`, `/.config/app`

## Предлагаемая структура проекта

- `README.md` — контекст и цели
- `NEW-CHAT-PROMPT.md` — стартовый промпт для нового чата
- далее по мере реализации:
  - `src/` — код extension
  - `notes/` — исследования / ссылки / эксперименты
  - `tests/` — сценарии и регрессии

## Результат этого шага

Создан стартовый каталог проекта с описанием задачи и отдельным промптом для следующего чата.
