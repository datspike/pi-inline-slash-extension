import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { buildCommandCatalog } from "../../src/inline-slash/command-catalog.js";
import {
  createInlineSlashEditorClass,
  createInlineSlashSubmitStrategy,
  type InlineSlashSubmitStrategy,
} from "../../src/inline-slash/editor.js";
import type {
  AutocompleteApplyResult,
  AutocompleteItemLike,
  AutocompleteProviderLike,
  AutocompleteRequestOptions,
  AutocompleteSuggestions,
} from "../../src/inline-slash/types.js";

function sourceInfo(scope: "user" | "project" | "temporary", resourcePath: string) {
  return {
    path: resourcePath,
    source: "top-level",
    scope,
    origin: "top-level",
  } as const;
}

/**
 * Минимальный autocomplete и submit harness, который имитирует core editor cycle.
 */
class FakeCustomEditor {
  private lines = [""];
  private cursorLine = 0;
  private cursorCol = 0;
  private provider: AutocompleteProviderLike | null = null;
  private history: string[] = [];

  public autocompletePrefix = "";
  public onSubmit?: (text: string) => void;
  public onChange?: (text: string) => void;
  public lastSuggestions: AutocompleteSuggestions | null = null;
  public tryTriggerAutocompleteCalls = 0;
  public updateAutocompleteCalls = 0;
  public cancelAutocompleteCalls = 0;

  constructor(..._args: unknown[]) {}

  /**
   * Текущий текст буфера.
   */
  getText(): string {
    return this.lines.join("\n");
  }

  /**
   * Строки буфера для provider seam.
   */
  getLines(): string[] {
    return [...this.lines];
  }

  /**
   * Координаты курсора для smoke harness.
   */
  getCursor(): { line: number; col: number } {
    return { line: this.cursorLine, col: this.cursorCol };
  }

  /**
   * История отправок для parity assertions.
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * Добавление submit в историю по тем же правилам, что и у core editor.
   */
  addToHistory(text: string): void {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    if (this.history[0] === trimmed) {
      return;
    }

    this.history.unshift(trimmed);
  }

  /**
   * Прямое задание текста без side effects.
   */
  setText(text: string): void {
    this.lines = text.split("\n");
    this.cursorLine = this.lines.length - 1;
    this.cursorCol = this.lines[this.cursorLine]?.length ?? 0;
    this.onChange?.(this.getText());
  }

  /**
   * Инъекция autocomplete provider в harness.
   */
  setAutocompleteProvider(provider: AutocompleteProviderLike): void {
    this.provider = provider;
  }

  /**
   * Признак активного autocomplete popup.
   */
  isShowingAutocomplete(): boolean {
    return this.lastSuggestions !== null;
  }

  /**
   * Имитация core editor submit cycle с очисткой буфера до вызова callback.
   */
  submit(): void {
    const result = this.getText().trim();

    this.lines = [""];
    this.cursorLine = 0;
    this.cursorCol = 0;
    this.lastSuggestions = null;
    this.autocompletePrefix = "";
    this.onChange?.(this.getText());
    this.onSubmit?.(result);
  }

  /**
   * Имитация core editor input cycle.
   */
  handleInput(data: string): void {
    if (data === "\n") {
      this.insertNewLine();
    } else if (data === "\b") {
      this.deleteBackward();
    } else {
      this.insertText(data);
    }

    this.onChange?.(this.getText());

    if (this.isShowingAutocomplete()) {
      this.updateAutocomplete();
      return;
    }

    if (this.isCoreStartOfLineSlashContext()) {
      this.tryTriggerAutocomplete();
    }
  }

  /**
   * Явный запуск autocomplete, как это делает core editor.
   */
  tryTriggerAutocomplete(): void {
    this.tryTriggerAutocompleteCalls += 1;
    this.lastSuggestions = this.provider?.getSuggestions(
      this.lines,
      this.cursorLine,
      this.cursorCol,
    ) ?? null;
    this.autocompletePrefix = this.lastSuggestions?.prefix ?? "";

    if (!this.lastSuggestions) {
      this.cancelAutocomplete();
    }
  }

  /**
   * Обновление существующих suggestions без полной перезагрузки harness.
   */
  updateAutocomplete(): void {
    this.updateAutocompleteCalls += 1;
    this.lastSuggestions = this.provider?.getSuggestions(
      this.lines,
      this.cursorLine,
      this.cursorCol,
    ) ?? null;
    this.autocompletePrefix = this.lastSuggestions?.prefix ?? "";

    if (!this.lastSuggestions) {
      this.cancelAutocomplete();
    }
  }

  /**
   * Сброс popup state.
   */
  cancelAutocomplete(): void {
    this.cancelAutocompleteCalls += 1;
    this.lastSuggestions = null;
    this.autocompletePrefix = "";
  }

  /**
   * Вставка текста в текущую позицию курсора.
   */
  private insertText(text: string): void {
    const currentLine = this.lines[this.cursorLine] ?? "";
    const beforeCursor = currentLine.slice(0, this.cursorCol);
    const afterCursor = currentLine.slice(this.cursorCol);

    this.lines[this.cursorLine] = `${beforeCursor}${text}${afterCursor}`;
    this.cursorCol += text.length;
  }

  /**
   * Разрыв строки по текущему курсору.
   */
  private insertNewLine(): void {
    const currentLine = this.lines[this.cursorLine] ?? "";
    const beforeCursor = currentLine.slice(0, this.cursorCol);
    const afterCursor = currentLine.slice(this.cursorCol);

    this.lines[this.cursorLine] = beforeCursor;
    this.lines.splice(this.cursorLine + 1, 0, afterCursor);
    this.cursorLine += 1;
    this.cursorCol = 0;
  }

  /**
   * Backspace для negative-path smoke cases.
   */
  private deleteBackward(): void {
    if (this.cursorCol > 0) {
      const currentLine = this.lines[this.cursorLine] ?? "";
      this.lines[this.cursorLine] =
        currentLine.slice(0, this.cursorCol - 1)
        + currentLine.slice(this.cursorCol);
      this.cursorCol -= 1;
      return;
    }

    if (this.cursorLine === 0) {
      return;
    }

    const previousLine = this.lines[this.cursorLine - 1] ?? "";
    const currentLine = this.lines[this.cursorLine] ?? "";
    this.lines[this.cursorLine - 1] = `${previousLine}${currentLine}`;
    this.lines.splice(this.cursorLine, 1);
    this.cursorLine -= 1;
    this.cursorCol = previousLine.length;
  }

  /**
   * Имитация встроенного first-line slash trigger из core editor.
   */
  private isCoreStartOfLineSlashContext(): boolean {
    if (this.cursorLine !== 0) {
      return false;
    }

    return (this.lines[0] ?? "").slice(0, this.cursorCol).startsWith("/");
  }
}

/**
 * Локальный каталог smoke scenarios.
 */
function createCatalog() {
  return buildCommandCatalog([
    {
      name: "gsd",
      source: "extension",
      description: "GSD helper",
      sourceInfo: sourceInfo("project", ".pi/extensions/inline-slash.ts"),
    },
    {
      name: "skill:create-skill",
      source: "skill",
      description: "Create skill",
      sourceInfo: sourceInfo("project", ".pi/skills/create-skill/SKILL.md"),
    },
    {
      name: "skill:commit-list",
      source: "skill",
      description: "Create commit plan",
      sourceInfo: sourceInfo("project", ".pi/skills/commit-list/SKILL.md"),
    },
  ]);
}

/**
 * Delegate provider с шпионами для start-of-line regression.
 */
function createDelegate(
  result: AutocompleteSuggestions | null,
): AutocompleteProviderLike & {
  getSuggestionsSpy: ReturnType<typeof vi.fn>;
  applyCompletionSpy: ReturnType<typeof vi.fn>;
} {
  const getSuggestionsSpy = vi.fn(
    (
      _lines: string[],
      _cursorLine: number,
      _cursorCol: number,
      _options?: AutocompleteRequestOptions,
    ) => result,
  );
  const applyCompletionSpy = vi.fn(
    (
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      item: AutocompleteItemLike,
      prefix: string,
    ): AutocompleteApplyResult => ({
      lines: [`delegate:${prefix}:${item.value}`],
      cursorLine,
      cursorCol,
    }),
  );

  return {
    getSuggestionsSpy,
    applyCompletionSpy,
    getSuggestions: getSuggestionsSpy,
    applyCompletion: applyCompletionSpy,
  };
}

/**
 * Создание editor wrapper поверх fake harness.
 */
function createEditor(
  provider?: AutocompleteProviderLike,
  catalog = createCatalog(),
  submitStrategy?: InlineSlashSubmitStrategy,
): FakeCustomEditor {
  const InlineSlashEditor = createInlineSlashEditorClass(FakeCustomEditor, {
    catalog,
    submitStrategy,
  });
  const editor = new InlineSlashEditor();

  if (provider) {
    editor.setAutocompleteProvider(provider);
  }

  return editor;
}

/**
 * Сборка submit harness поверх реального extension submit strategy.
 */
function createSubmitHarness(options?: {
  sendUserMessage?: (text: string) => void;
}): {
  editor: FakeCustomEditor;
  coreOnSubmit: ReturnType<typeof vi.fn>;
  sendUserMessage: ReturnType<typeof vi.fn>;
} {
  const sendUserMessage = vi.fn(options?.sendUserMessage ?? (() => undefined));
  const submitStrategy = createInlineSlashSubmitStrategy({
    sendUserMessage,
  } as Parameters<typeof createInlineSlashSubmitStrategy>[0]);
  const editor = createEditor(undefined, createCatalog(), submitStrategy);
  const coreOnSubmit = vi.fn((text: string) => {
    if (!text) {
      return;
    }

    editor.addToHistory(text);
  });

  editor.onSubmit = coreOnSubmit;

  return { editor, coreOnSubmit, sendUserMessage };
}

describe("InlineSlashEditor smoke collaboration", () => {
  test("second-line-gsd-refresh: второй строке хватает обычного typing cycle для /gsd", () => {
    /** second-line-gsd-refresh: first-line restriction core editor снимается wrapper refresh cycle. */
    const delegate = createDelegate(null);
    const editor = createEditor(delegate);

    editor.handleInput("П");
    editor.handleInput("р");
    editor.handleInput("е");
    editor.handleInput("в");
    editor.handleInput("\n");
    editor.handleInput("/");
    editor.handleInput("g");

    expect(editor.lastSuggestions).toEqual({
      items: [{ value: "/gsd", label: "/gsd", description: "GSD helper" }],
      prefix: "/g",
    });
    expect(editor.tryTriggerAutocompleteCalls).toBeGreaterThan(0);
    expect(delegate.getSuggestionsSpy).not.toHaveBeenCalled();

    editor.handleInput("s");

    expect(editor.lastSuggestions?.prefix).toBe("/gs");
    expect(editor.updateAutocompleteCalls).toBeGreaterThan(0);
  });

  test("inline-skill-refresh: mid-line skill token обновляет suggestions внутри обычного текста", () => {
    /** inline-skill-refresh: inline skill autocomplete не требует start-of-line первой строки. */
    const editor = createEditor(createDelegate(null));

    editor.setText("Нужно включить /skill:create");
    editor.handleInput("-");

    expect(editor.lastSuggestions).toEqual({
      items: [
        {
          value: "/skill:create-skill",
          label: "/skill:create-skill",
          description: "Create skill",
        },
      ],
      prefix: "/skill:create-",
    });
  });

  test("inline-short-skill-refresh: short /commit даёт canonical skill suggestion", () => {
    /** inline-short-skill-refresh: plain short skill alias должен работать как в upstream skill autocomplete. */
    const editor = createEditor(createDelegate(null));

    editor.setText("Нужно вызвать /commit");
    editor.handleInput("-");

    expect(editor.lastSuggestions).toEqual({
      items: [
        {
          value: "/skill:commit-list",
          label: "/skill:commit-list",
          description: "Create commit plan",
        },
      ],
      prefix: "/commit-",
    });
  });

  test("start-of-line-regression: первая строка остаётся delegated core path", () => {
    /** start-of-line-regression: wrapper не должен перехватывать корректный upstream slash сценарий. */
    const delegateResult = {
      items: [{ value: "gsd", label: "gsd", description: "Core slash" }],
      prefix: "/g",
    };
    const delegate = createDelegate(delegateResult);
    const editor = createEditor(delegate);

    editor.handleInput("/");
    editor.handleInput("g");

    expect(editor.lastSuggestions).toEqual(delegateResult);
    expect(delegate.getSuggestionsSpy).toHaveBeenLastCalledWith(["/g"], 0, 2, {});
  });

  test("missing-provider-injection: без setAutocompleteProvider текст не повреждается", () => {
    /** missing-provider-injection: отсутствие core injection должно давать safe no-op, а не corruption. */
    const editor = createEditor(undefined);

    editor.handleInput("t");
    editor.handleInput("e");
    editor.handleInput("x");
    editor.handleInput("t");
    editor.handleInput(" ");
    editor.handleInput("/");
    editor.handleInput("g");

    expect(editor.getText()).toBe("text /g");
    expect(editor.lastSuggestions).toBeNull();
  });

  test("empty-catalog-inline-no-op: пустой каталог не оставляет stale slash popup", () => {
    /** empty-catalog-inline-no-op: malformed catalog input не должен ронять editor cycle. */
    const emptyCatalog = buildCommandCatalog([]);
    const editor = createEditor(createDelegate(null), emptyCatalog);

    editor.setText("строка /g");
    editor.handleInput("s");

    expect(editor.getText()).toBe("строка /gs");
    expect(editor.lastSuggestions).toBeNull();
    expect(editor.tryTriggerAutocompleteCalls).toBe(0);
  });
});

describe("InlineSlashEditor submit routing smoke", () => {
  test("submit-home-path-bypass: /home path уходит через sendUserMessage и не вызывает core submit", () => {
    /** submit-home-path-bypass: leading absolute path bypass'ит core callback, но сохраняет clear/history parity. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/home/spike/file.ts");
    editor.submit();

    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage).toHaveBeenCalledWith("/home/spike/file.ts");
    expect(coreOnSubmit).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/home/spike/file.ts"]);
  });

  test("submit-tmp-path-bypass: /tmp path повторно идёт через bypass без stale submit state", () => {
    /** submit-tmp-path-bypass: второй absolute-path сценарий должен работать как обычное user message submit. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/tmp/log.txt");
    editor.submit();
    editor.setText("/tmp/log.txt");
    editor.submit();

    expect(sendUserMessage).toHaveBeenCalledTimes(2);
    expect(sendUserMessage).toHaveBeenNthCalledWith(1, "/tmp/log.txt");
    expect(sendUserMessage).toHaveBeenNthCalledWith(2, "/tmp/log.txt");
    expect(coreOnSubmit).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/tmp/log.txt"]);
  });

  test("submit-gsd-delegate: /gsd auto остаётся delegated core submit", () => {
    /** submit-gsd-delegate: реальная slash-команда не должна уходить через обычный user-message bypass. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/gsd auto");
    editor.submit();

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(coreOnSubmit).toHaveBeenCalledOnce();
    expect(coreOnSubmit).toHaveBeenCalledWith("/gsd auto");
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/gsd auto"]);
  });

  test("submit-skill-delegate: /skill:create-skill demo остаётся delegated core submit", () => {
    /** submit-skill-delegate: skill submit path должен остаться на upstream command dispatcher. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/skill:create-skill demo");
    editor.submit();

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(coreOnSubmit).toHaveBeenCalledOnce();
    expect(coreOnSubmit).toHaveBeenCalledWith("/skill:create-skill demo");
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/skill:create-skill demo"]);
  });

  test("submit-unknown-delegate: /unknown остаётся delegated core submit guard-case", () => {
    /** submit-unknown-delegate: syntactic unknown slash должен дойти до core unknown-command handling. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/unknown");
    editor.submit();

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(coreOnSubmit).toHaveBeenCalledOnce();
    expect(coreOnSubmit).toHaveBeenCalledWith("/unknown");
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/unknown"]);
  });

  test("missing-sender-hard-failure: path bypass без sendUserMessage падает явно", () => {
    /** missing-sender-hard-failure: broken runtime wiring не должен молча делегировать absolute path в core submit. */
    const submitStrategy = createInlineSlashSubmitStrategy({
      sendUserMessage: undefined,
    } as Parameters<typeof createInlineSlashSubmitStrategy>[0]);
    const editor = createEditor(undefined, createCatalog(), submitStrategy);
    const coreOnSubmit = vi.fn();

    editor.onSubmit = coreOnSubmit;
    editor.setText("/home/spike/file.ts");

    expect(() => editor.submit()).toThrowError(
      "Inline slash extension requires api.sendUserMessage for absolute path submit bypass.",
    );
    expect(coreOnSubmit).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual([]);
  });
});

describe("inline slash extension entrypoint", () => {
  async function loadEntrypoint(relativePath: string) {
    const extensionPath = path.resolve(process.cwd(), relativePath);
    const loaded = await import(pathToFileURL(extensionPath).href) as {
      default?: (
        api: {
          on(event: string, handler: (event: unknown, ctx: any) => void): void;
          getCommands(): unknown[];
          sendUserMessage(text: string): void;
        },
      ) => void;
    } | ((
      api: {
        on(event: string, handler: (event: unknown, ctx: any) => void): void;
        getCommands(): unknown[];
        sendUserMessage(text: string): void;
      },
    ) => void);

    return typeof loaded === "function" ? loaded : loaded.default;
  }

  function assertEntrypointWiring(
    activate: ((
      api: {
        on(event: string, handler: (event: unknown, ctx: any) => void): void;
        getCommands(): unknown[];
        sendUserMessage(text: string): void;
      },
    ) => void) | undefined,
    extensionPath: string,
  ) {
    const handlers = new Map<string, (event: unknown, ctx: any) => void>();
    let editorFactory:
      | ((tui: unknown, theme: unknown, keybindings: unknown) => { setAutocompleteProvider: unknown; handleInput: unknown; onSubmit: unknown })
      | undefined;

    expect(activate).toBeTypeOf("function");

    activate?.({
      on(event, handler) {
        handlers.set(event, handler);
      },
      getCommands() {
        return [
          {
            name: "gsd",
            source: "extension",
            description: "GSD helper",
            sourceInfo: sourceInfo("project", extensionPath),
          },
          {
            name: "skill:create-skill",
            source: "skill",
            description: "Create skill",
            sourceInfo: sourceInfo("project", ".pi/skills/create-skill/SKILL.md"),
          },
        ];
      },
      sendUserMessage() {},
    });

    const sessionStartHandler = handlers.get("session_start");

    expect(sessionStartHandler).toBeTypeOf("function");

    sessionStartHandler?.({}, {
      hasUI: true,
      ui: {
        setEditorComponent(factory: typeof editorFactory) {
          editorFactory = factory;
        },
      },
    });

    expect(editorFactory).toBeTypeOf("function");
    const editor = editorFactory?.({}, {}, {});

    expect(editor).toBeDefined();
    expect(editor?.setAutocompleteProvider).toBeTypeOf("function");
    expect(editor?.handleInput).toBeTypeOf("function");
    expect(editor?.onSubmit).toBeTypeOf("function");
  }

  test("package-entrypoint-loader: package entrypoint импортируется и wiring доходит до setEditorComponent", async () => {
    /** package-entrypoint-loader: package entrypoint должен быть installable без project-local shim. */
    const activate = await loadEntrypoint("extensions/inline-slash.ts");

    assertEntrypointWiring(activate, "extensions/inline-slash.ts");
  });

  test("project-shim-loader: project-local shim реэкспортирует package entrypoint", async () => {
    /** project-shim-loader: .pi shim должен оставаться совместимым с auto-discovery project scope. */
    const activate = await loadEntrypoint(".pi/extensions/inline-slash.ts");

    assertEntrypointWiring(activate, ".pi/extensions/inline-slash.ts");
  });
});
