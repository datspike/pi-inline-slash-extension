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
 * Minimal autocomplete and submit harness that imitates the core editor cycle.
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
   * Current buffer text.
   */
  getText(): string {
    return this.lines.join("\n");
  }

  /**
   * Buffer lines for the provider seam.
   */
  getLines(): string[] {
    return [...this.lines];
  }

  /**
   * Cursor coordinates for the smoke harness.
   */
  getCursor(): { line: number; col: number } {
    return { line: this.cursorLine, col: this.cursorCol };
  }

  /**
   * Submission history for parity assertions.
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * Add submit history entries using the same rules as the core editor.
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
   * Set text directly without side effects.
   */
  setText(text: string): void {
    this.lines = text.split("\n");
    this.cursorLine = this.lines.length - 1;
    this.cursorCol = this.lines[this.cursorLine]?.length ?? 0;
    this.onChange?.(this.getText());
  }

  /**
   * Inject the autocomplete provider into the harness.
   */
  setAutocompleteProvider(provider: AutocompleteProviderLike): void {
    this.provider = provider;
  }

  /**
   * Whether the autocomplete popup is currently active.
   */
  isShowingAutocomplete(): boolean {
    return this.lastSuggestions !== null;
  }

  /**
   * Imitate the core editor submit cycle, clearing the buffer before the callback.
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
   * Imitate the core editor input cycle.
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
   * Explicitly trigger autocomplete the same way core does.
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
   * Refresh existing suggestions without reloading the whole harness.
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
   * Reset popup state.
   */
  cancelAutocomplete(): void {
    this.cancelAutocompleteCalls += 1;
    this.lastSuggestions = null;
    this.autocompletePrefix = "";
  }

  /**
   * Insert text at the current cursor position.
   */
  private insertText(text: string): void {
    const currentLine = this.lines[this.cursorLine] ?? "";
    const beforeCursor = currentLine.slice(0, this.cursorCol);
    const afterCursor = currentLine.slice(this.cursorCol);

    this.lines[this.cursorLine] = `${beforeCursor}${text}${afterCursor}`;
    this.cursorCol += text.length;
  }

  /**
   * Split the line at the current cursor position.
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
   * Backspace for negative-path smoke cases.
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
   * Imitate the built-in first-line slash trigger from the core editor.
   */
  private isCoreStartOfLineSlashContext(): boolean {
    if (this.cursorLine !== 0) {
      return false;
    }

    return (this.lines[0] ?? "").slice(0, this.cursorCol).startsWith("/");
  }
}

/**
 * Local catalog for smoke scenarios.
 */
function createCatalog() {
  return buildCommandCatalog([
    {
      name: "gsd",
      source: "extension",
      description: "GSD helper",
      sourceInfo: sourceInfo("project", "extensions/inline-slash.ts"),
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
 * Delegate provider with spies for start-of-line regression.
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
 * Create the editor wrapper on top of the fake harness.
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
 * Build the submit harness on top of the real extension submit strategy.
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
  test("second-line-gsd-refresh: a regular typing cycle is enough for /gsd on the second line", () => {
    /** second-line-gsd-refresh: the wrapper refresh cycle removes the core editor first-line restriction. */
    const delegate = createDelegate(null);
    const editor = createEditor(delegate);

    editor.handleInput("P");
    editor.handleInput("r");
    editor.handleInput("e");
    editor.handleInput("v");
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

  test("inline-skill-refresh: a mid-line skill token refreshes suggestions inside regular text", () => {
    /** inline-skill-refresh: inline skill autocomplete does not require the first-line start-of-line position. */
    const editor = createEditor(createDelegate(null));

    editor.setText("Need to enable /skill:create");
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

  test("inline-short-skill-refresh: short /commit yields the canonical skill suggestion", () => {
    /** inline-short-skill-refresh: the plain short skill alias must behave the same as upstream skill autocomplete. */
    const editor = createEditor(createDelegate(null));

    editor.setText("Need to call /commit");
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

  test("start-of-line-regression: the first line remains the delegated core path", () => {
    /** start-of-line-regression: the wrapper must not intercept a valid upstream slash scenario. */
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

  test("missing-provider-injection: text stays intact without setAutocompleteProvider", () => {
    /** missing-provider-injection: missing core injection must result in a safe no-op, not corruption. */
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

  test("empty-catalog-inline-no-op: an empty catalog does not leave a stale slash popup", () => {
    /** empty-catalog-inline-no-op: malformed catalog input must not break the editor cycle. */
    const emptyCatalog = buildCommandCatalog([]);
    const editor = createEditor(createDelegate(null), emptyCatalog);

    editor.setText("line /g");
    editor.handleInput("s");

    expect(editor.getText()).toBe("line /gs");
    expect(editor.lastSuggestions).toBeNull();
    expect(editor.tryTriggerAutocompleteCalls).toBe(0);
  });
});

describe("InlineSlashEditor submit routing smoke", () => {
  test("submit-home-path-bypass: a /home path goes through sendUserMessage and does not call core submit", () => {
    /** submit-home-path-bypass: a leading absolute path bypasses the core callback while preserving clear/history parity. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/home/spike/file.ts");
    editor.submit();

    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage).toHaveBeenCalledWith("/home/spike/file.ts");
    expect(coreOnSubmit).not.toHaveBeenCalled();
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/home/spike/file.ts"]);
  });

  test("submit-tmp-path-bypass: a /tmp path goes through bypass again without stale submit state", () => {
    /** submit-tmp-path-bypass: the second absolute-path scenario must behave like a regular user-message submit. */
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

  test("submit-gsd-delegate: /gsd auto stays delegated core submit", () => {
    /** submit-gsd-delegate: a real slash command must not go through the regular user-message bypass. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/gsd auto");
    editor.submit();

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(coreOnSubmit).toHaveBeenCalledOnce();
    expect(coreOnSubmit).toHaveBeenCalledWith("/gsd auto");
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/gsd auto"]);
  });

  test("submit-skill-delegate: /skill:create-skill demo stays delegated core submit", () => {
    /** submit-skill-delegate: the skill submit path must remain on the upstream command dispatcher. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/skill:create-skill demo");
    editor.submit();

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(coreOnSubmit).toHaveBeenCalledOnce();
    expect(coreOnSubmit).toHaveBeenCalledWith("/skill:create-skill demo");
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/skill:create-skill demo"]);
  });

  test("submit-unknown-delegate: /unknown stays a delegated core submit guard case", () => {
    /** submit-unknown-delegate: a syntactic unknown slash must reach core unknown-command handling. */
    const { editor, coreOnSubmit, sendUserMessage } = createSubmitHarness();

    editor.setText("/unknown");
    editor.submit();

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(coreOnSubmit).toHaveBeenCalledOnce();
    expect(coreOnSubmit).toHaveBeenCalledWith("/unknown");
    expect(editor.getText()).toBe("");
    expect(editor.getHistory()).toEqual(["/unknown"]);
  });

  test("missing-sender-hard-failure: path bypass without sendUserMessage fails loudly", () => {
    /** missing-sender-hard-failure: broken runtime wiring must not silently delegate an absolute path to core submit. */
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

  test("package-entrypoint-loader: package entrypoint imports and wiring reaches setEditorComponent", async () => {
    /** package-entrypoint-loader: the package entrypoint must stay installable as the only shipped runtime entrypoint. */
    const activate = await loadEntrypoint("extensions/inline-slash.ts");

    assertEntrypointWiring(activate, "extensions/inline-slash.ts");
  });
});
