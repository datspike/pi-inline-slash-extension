import { resolveSubmitRouting } from "./classifier.js";
import {
  InlineSlashProvider,
  isDelegatedStartOfMessage,
} from "./provider.js";
import type { AutocompleteProviderLike, InlineSlashCatalog } from "./types.js";

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
 * Runtime submit strategy для absolute path bypass без изменения core slash поведения.
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
 * Установка submit shim поверх instance property, потому что base Editor держит own field `onSubmit`.
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
 * Извлечение только минимального набора private autocomplete hooks.
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
 * Снимок текущего текста и курсора только через публичные editor methods.
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
 * Проверка, что editor state реально изменился после handleInput.
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
 * Обновление autocomplete после обычного редактирования для inline и second-line slash.
 */
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
  );

  if (hooks.isShowingAutocomplete()) {
    hooks.updateAutocomplete();
    return;
  }

  if (suggestions && suggestions.items.length > 0) {
    hooks.tryTriggerAutocomplete();
  }
}

/**
 * Фабрика класса editor wrapper, который расширяет runtime CustomEditor без форка core.
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
     * Перехват core autocomplete provider и обёртка его локальным inline provider.
     */
    override setAutocompleteProvider(provider: AutocompleteProviderLike): void {
      this.inlineSlashProvider = new InlineSlashProvider({
        catalog: options.catalog,
        delegate: provider,
      });
      super.setAutocompleteProvider(this.inlineSlashProvider);
    }

    /**
     * Обычный ввод + дополнительный refresh cycle для inline slash scenarios.
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
