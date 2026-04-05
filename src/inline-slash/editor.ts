import { resolveSubmitRouting } from "./classifier.js";
import {
  InlineSlashProvider,
  isDelegatedStartOfMessage,
} from "./provider.js";
import type { AutocompleteProviderLike, AutocompleteSuggestions, InlineSlashCatalog } from "./types.js";

export interface InlineSlashEditorOptions {
  catalog: InlineSlashCatalog;
  submitStrategy?: InlineSlashSubmitStrategy;
}

export interface EditorCursorPosition {
  line: number;
  col: number;
}

export interface EditorSnapshot {
  text: string;
  lines: string[];
  cursorLine: number;
  cursorCol: number;
}

export interface InlineSlashEditorBase {
  getText(): string;
  getLines?(): string[];
  getCursor?(): EditorCursorPosition;
  handleInput(data: string): void;
  setAutocompleteProvider(provider: unknown): void;
  addToHistory?(text: string): void;
  onSubmit?: (text: string) => void;
}

export interface InlineSlashSubmitStrategyContext {
  text: string;
  editor: InlineSlashEditorBase;
  delegateCoreSubmit: (text: string) => void;
}

export type InlineSlashSubmitStrategy = (
  context: InlineSlashSubmitStrategyContext,
) => void;

export interface InlineSlashSubmitTransport {
  sendUserMessage?: (text: string) => void;
}

interface InlineSlashAutocompleteHooks {
  isShowingAutocomplete(): boolean;
  tryTriggerAutocomplete(explicitTab?: boolean): void;
  updateAutocomplete(): void;
}

type InlineSlashEditorConstructor = new (...args: any[]) => InlineSlashEditorBase;

/**
 * Runtime submit strategy for absolute-path bypass without changing core slash behavior.
 */
export function createInlineSlashSubmitStrategy(
  transport: InlineSlashSubmitTransport,
): InlineSlashSubmitStrategy {
  return ({ text, editor, delegateCoreSubmit }) => {
    const routing = resolveSubmitRouting(text);

    if (routing.route !== "send-user-message") {
      delegateCoreSubmit(routing.preparedText);
      return;
    }

    if (typeof transport.sendUserMessage !== "function") {
      throw new Error("Inline slash extension requires api.sendUserMessage for absolute path submit bypass.");
    }

    editor.addToHistory?.(routing.preparedText);
    transport.sendUserMessage(routing.preparedText);
  };
}

/**
 * Install a submit shim on top of the instance property because the base editor keeps `onSubmit` as an own field.
 */
function installSubmitStrategy(
  editor: InlineSlashEditorBase,
  submitStrategy?: InlineSlashSubmitStrategy,
): void {
  if (!submitStrategy) {
    return;
  }

  let delegateCoreSubmit = editor.onSubmit;
  const wrappedSubmit = (text: string): void => {
    submitStrategy({
      text,
      editor,
      delegateCoreSubmit: (preparedText: string) => {
        delegateCoreSubmit?.(preparedText);
      },
    });
  };

  Reflect.deleteProperty(editor, "onSubmit");
  Object.defineProperty(editor, "onSubmit", {
    configurable: true,
    enumerable: true,
    get: () => wrappedSubmit,
    set: (handler: ((text: string) => void) | undefined) => {
      delegateCoreSubmit = handler;
    },
  });
}

/**
 * Extract only the minimal set of private autocomplete hooks.
 */
function getInlineSlashAutocompleteHooks(
  editor: InlineSlashEditorBase,
): InlineSlashAutocompleteHooks | null {
  const candidate = editor as Partial<InlineSlashAutocompleteHooks>;

  if (
    typeof candidate.isShowingAutocomplete !== "function"
    || typeof candidate.tryTriggerAutocomplete !== "function"
    || typeof candidate.updateAutocomplete !== "function"
  ) {
    return null;
  }

  return {
    isShowingAutocomplete: candidate.isShowingAutocomplete.bind(editor),
    tryTriggerAutocomplete: candidate.tryTriggerAutocomplete.bind(editor),
    updateAutocomplete: candidate.updateAutocomplete.bind(editor),
  };
}

/**
 * Read the current text and cursor snapshot using only public editor methods.
 */
export function readEditorSnapshot(editor: InlineSlashEditorBase): EditorSnapshot | null {
  if (typeof editor.getLines !== "function" || typeof editor.getCursor !== "function") {
    return null;
  }

  const text = editor.getText();
  const lines = editor.getLines();
  const cursor = editor.getCursor();

  return {
    text,
    lines,
    cursorLine: cursor.line,
    cursorCol: cursor.col,
  };
}

/**
 * Check whether editor state actually changed after `handleInput`.
 */
export function didEditorSnapshotChange(
  before: EditorSnapshot | null,
  after: EditorSnapshot | null,
): boolean {
  if (!before || !after) {
    return false;
  }

  return (
    before.text !== after.text
    || before.cursorLine !== after.cursorLine
    || before.cursorCol !== after.cursorCol
  );
}

/**
 * Refresh autocomplete after regular editing for inline and second-line slash scenarios.
 */
function hasSuggestionItems(
  suggestions: AutocompleteSuggestions | null | Promise<AutocompleteSuggestions | null>,
): suggestions is AutocompleteSuggestions {
  return !!suggestions
    && typeof suggestions === "object"
    && "items" in suggestions
    && Array.isArray(suggestions.items)
    && suggestions.items.length > 0;
}

export function refreshInlineSlashAutocomplete(
  editor: InlineSlashEditorBase,
  provider: InlineSlashProvider,
): void {
  const snapshot = readEditorSnapshot(editor);

  if (!snapshot) {
    return;
  }

  if (isDelegatedStartOfMessage(snapshot.lines, snapshot.cursorLine, snapshot.cursorCol)) {
    return;
  }

  const hooks = getInlineSlashAutocompleteHooks(editor);

  if (!hooks) {
    return;
  }

  const suggestions = provider.getSuggestions(
    snapshot.lines,
    snapshot.cursorLine,
    snapshot.cursorCol,
    { signal: new AbortController().signal },
  );

  if (hooks.isShowingAutocomplete()) {
    hooks.updateAutocomplete();
    return;
  }

  if (hasSuggestionItems(suggestions)) {
    hooks.tryTriggerAutocomplete();
  }
}

/**
 * Factory for an editor wrapper class that extends runtime `CustomEditor` without forking core.
 */
export function createInlineSlashEditorClass<TBase extends InlineSlashEditorConstructor>(
  BaseEditor: TBase,
  options: InlineSlashEditorOptions,
): TBase {
  class InlineSlashEditor extends BaseEditor {
    private inlineSlashProvider = new InlineSlashProvider({
      catalog: options.catalog,
    });

    constructor(...args: any[]) {
      super(...args);
      installSubmitStrategy(this, options.submitStrategy);
    }

    /**
     * Intercept the core autocomplete provider and wrap it with the local inline provider.
     */
    override setAutocompleteProvider(provider: AutocompleteProviderLike): void {
      this.inlineSlashProvider = new InlineSlashProvider({
        catalog: options.catalog,
        delegate: provider,
      });
      super.setAutocompleteProvider(this.inlineSlashProvider);
    }

    /**
     * Regular input plus an extra refresh cycle for inline slash scenarios.
     */
    override handleInput(data: string): void {
      const before = readEditorSnapshot(this);

      super.handleInput(data);

      const after = readEditorSnapshot(this);

      if (!didEditorSnapshotChange(before, after)) {
        return;
      }

      refreshInlineSlashAutocomplete(this, this.inlineSlashProvider);
    }
  }

  return InlineSlashEditor as unknown as TBase;
}
