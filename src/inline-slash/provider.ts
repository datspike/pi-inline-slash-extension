import { analyzeSlashToken } from "./classifier.js";
import type {
  AutocompleteApplyResult,
  AutocompleteItemLike,
  AutocompleteProviderLike,
  AutocompleteRequestOptions,
  AutocompleteSuggestions,
  InlineSlashCatalog,
  SlashTokenAnalysis,
  SlashTokenBounds,
} from "./types.js";

export interface InlineSlashProviderOptions {
  catalog: InlineSlashCatalog;
  delegate?: AutocompleteProviderLike | null;
  analyzeToken?: (text: string, cursor: number) => SlashTokenAnalysis;
}

/**
 * Соединение массива строк редактора в единый текстовый буфер.
 */
function joinLines(lines: readonly string[]): string {
  return lines.join("\n");
}

/**
 * Проверка, что bounds не выходят за пределы текущего текста.
 */
function isValidBounds(bounds: SlashTokenBounds, textLength: number): boolean {
  return bounds.start >= 0 && bounds.start <= bounds.end && bounds.end <= textLength;
}

/**
 * Перевод позиции курсора line/col в абсолютный offset буфера.
 */
function cursorToOffset(lines: readonly string[], cursorLine: number, cursorCol: number): number | null {
  if (cursorLine < 0 || cursorCol < 0) {
    return null;
  }

  const safeLines = lines.length > 0 ? lines : [""];

  if (cursorLine >= safeLines.length) {
    return null;
  }

  const currentLine = safeLines[cursorLine] ?? "";

  if (cursorCol > currentLine.length) {
    return null;
  }

  let offset = 0;

  for (let index = 0; index < cursorLine; index += 1) {
    offset += (safeLines[index] ?? "").length + 1;
  }

  return offset + cursorCol;
}

/**
 * Перевод абсолютного offset обратно в line/col координаты.
 */
function offsetToCursor(text: string, offset: number): { cursorLine: number; cursorCol: number } {
  const boundedOffset = Math.max(0, Math.min(offset, text.length));
  const beforeCursor = text.slice(0, boundedOffset);
  const lines = beforeCursor.split("\n");
  const cursorLine = lines.length - 1;
  const cursorCol = lines.at(-1)?.length ?? 0;

  return { cursorLine, cursorCol };
}

/**
 * Разбиение буфера обратно в строки редактора.
 */
function splitLines(text: string): string[] {
  return text.split("\n");
}

/**
 * Проверка, что курсор находится в делегируемом core slash-сценарии.
 */
function isDelegatedStartOfMessage(
  lines: readonly string[],
  cursorLine: number,
  cursorCol: number,
): boolean {
  if (cursorLine !== 0) {
    return false;
  }

  const currentLine = lines[0] ?? "";
  const textBeforeCursor = currentLine.slice(0, cursorCol);

  return textBeforeCursor.startsWith("/");
}

/**
 * Нормализация текста вставки так, чтобы ведущий slash никогда не терялся.
 */
function normalizeInsertText(item: AutocompleteItemLike): string {
  const rawValue = item.value.trim();

  if (rawValue.startsWith("/")) {
    return rawValue;
  }

  return `/${rawValue.replace(/^\/+/, "")}`;
}

/**
 * Фильтрация каталога по префиксу текущего slash-токена.
 */
function filterCatalog(catalog: InlineSlashCatalog, query: string): AutocompleteItemLike[] {
  const normalizedQuery = query.toLowerCase();

  return catalog.entries
    .filter((entry) => entry.matchKeys.some((matchKey) => matchKey.startsWith(normalizedQuery)))
    .map((entry) => ({
      value: entry.insertText,
      label: entry.label,
      ...(entry.description ? { description: entry.description } : {}),
    }));
}

/**
 * Pure provider для inline и second-line slash/skill autocomplete.
 */
export class InlineSlashProvider implements AutocompleteProviderLike {
  private readonly catalog: InlineSlashCatalog;
  private readonly delegate: AutocompleteProviderLike | null;
  private readonly analyzeToken: (text: string, cursor: number) => SlashTokenAnalysis;

  constructor(options: InlineSlashProviderOptions) {
    this.catalog = options.catalog;
    this.delegate = options.delegate ?? null;
    this.analyzeToken = options.analyzeToken ?? analyzeSlashToken;
  }

  /**
   * Построение suggestions для inline slash-токена или делегирование core provider.
   */
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: AutocompleteRequestOptions = {},
  ): AutocompleteSuggestions | null {
    if (isDelegatedStartOfMessage(lines, cursorLine, cursorCol)) {
      return this.delegate?.getSuggestions(lines, cursorLine, cursorCol, options) ?? null;
    }

    const offset = cursorToOffset(lines, cursorLine, cursorCol);

    if (offset === null) {
      return null;
    }

    const text = joinLines(lines);
    const analysis = this.analyzeToken(text, offset);

    if (analysis.status !== "match" || !isValidBounds(analysis.replacement, text.length)) {
      return null;
    }

    const items = filterCatalog(this.catalog, analysis.query);

    if (items.length === 0) {
      return null;
    }

    return {
      items,
      prefix: analysis.token,
    };
  }

  /**
   * Применение completion только к текущему токену без порчи соседнего текста.
   */
  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItemLike,
    prefix: string,
  ): AutocompleteApplyResult {
    if (isDelegatedStartOfMessage(lines, cursorLine, cursorCol)) {
      return this.delegate?.applyCompletion(lines, cursorLine, cursorCol, item, prefix) ?? {
        lines,
        cursorLine,
        cursorCol,
      };
    }

    const offset = cursorToOffset(lines, cursorLine, cursorCol);

    if (offset === null) {
      return {
        lines,
        cursorLine,
        cursorCol,
      };
    }

    const text = joinLines(lines);
    const analysis = this.analyzeToken(text, offset);

    if (analysis.status !== "match" || !isValidBounds(analysis.replacement, text.length)) {
      return {
        lines,
        cursorLine,
        cursorCol,
      };
    }

    const insertText = normalizeInsertText(item);
    const beforeToken = text.slice(0, analysis.replacement.start);
    const afterToken = text.slice(analysis.replacement.end);
    const suffix = afterToken.length === 0 ? " " : "";
    const updatedText = `${beforeToken}${insertText}${suffix}${afterToken}`;
    const updatedCursor = offsetToCursor(updatedText, analysis.replacement.start + insertText.length + suffix.length);

    return {
      lines: splitLines(updatedText),
      cursorLine: updatedCursor.cursorLine,
      cursorCol: updatedCursor.cursorCol,
    };
  }
}
