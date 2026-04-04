import { InlineSlashProvider } from "./provider.js";
import type { AutocompleteProviderLike, InlineSlashCatalog } from "./types.js";

export interface InlineSlashEditorOptions {
  catalog: InlineSlashCatalog;
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
  setAutocompleteProvider(provider: AutocompleteProviderLike): void;
}

interface InlineSlashEditorInternals {
  state?: {
    lines?: string[];
    cursorLine?: number;
    cursorCol?: number;
  };
  autocompletePrefix?: string;
  tryTriggerAutocomplete?(explicitTab?: boolean): void;
  updateAutocomplete?(): void;
  cancelAutocomplete?(): void;
  isShowingAutocomplete?(): boolean;
}

type InlineSlashEditorConstructor = new (...args: any[]) => InlineSlashEditorBase;

/**
 * Снимок текущего текста и курсора из editor seam без зависимости от runtime Pi.
 */
export function readEditorSnapshot(editor: InlineSlashEditorBase): EditorSnapshot | null {
  const text = editor.getText();
  const lines =
    typeof editor.getLines === "function"
      ? editor.getLines()
      : text.split("\n");
  const cursor =
    typeof editor.getCursor === "function"
      ? editor.getCursor()
      : null;

  if (cursor) {
    return {
      text,
      lines,
      cursorLine: cursor.line,
      cursorCol: cursor.col,
    };
  }

  const internals = editor as InlineSlashEditorBase & InlineSlashEditorInternals;
  const state = internals.state;

  if (
    !state
    || typeof state.cursorLine !== "number"
    || typeof state.cursorCol !== "number"
  ) {
    return null;
  }

  return {
    text,
    lines: Array.isArray(state.lines) ? [...state.lines] : lines,
    cursorLine: state.cursorLine,
    cursorCol: state.cursorCol,
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
 * Проверка delegated core-path для первой строки, который нельзя ломать inline logic.
 */
export function isDelegatedStartOfMessage(
  lines: readonly string[],
  cursorLine: number,
  cursorCol: number,
): boolean {
  if (cursorLine !== 0) {
    return false;
  }

  const currentLine = lines[0] ?? "";
  return currentLine.slice(0, cursorCol).startsWith("/");
}

/**
 * Проверка, что активное autocomplete относится к slash prefix и может быть отменено.
 */
function hasSlashAutocompletePrefix(editor: InlineSlashEditorBase): boolean {
  const internals = editor as InlineSlashEditorBase & InlineSlashEditorInternals;
  return typeof internals.autocompletePrefix === "string"
    && internals.autocompletePrefix.startsWith("/");
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

  const suggestions = provider.getSuggestions(
    snapshot.lines,
    snapshot.cursorLine,
    snapshot.cursorCol,
  );
  const internals = editor as InlineSlashEditorBase & InlineSlashEditorInternals;

  if (suggestions && suggestions.items.length > 0) {
    if (internals.isShowingAutocomplete?.()) {
      internals.updateAutocomplete?.();
      return;
    }

    internals.tryTriggerAutocomplete?.();
    return;
  }

  if (internals.isShowingAutocomplete?.() && hasSlashAutocompletePrefix(editor)) {
    internals.cancelAutocomplete?.();
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
