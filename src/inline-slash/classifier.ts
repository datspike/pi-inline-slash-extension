import type {
  SlashAbsolutePathCandidate,
  SlashCandidateKind,
  SlashNoMatch,
  SlashTokenAnalysis,
  SlashTokenBounds,
  SubmitRoutingResult,
} from "./types.js";

const SKILL_TOKEN_PATTERN = /^\/skill:[a-z0-9._-]*$/i;
const COMMAND_TOKEN_PATTERN = /^\/[a-z][a-z0-9-]*$/i;
const WHITESPACE_PATTERN = /\s/;

/**
 * Проверка, что символ является пробельным разделителем токенов.
 */
function isWhitespaceCharacter(character: string): boolean {
  return WHITESPACE_PATTERN.test(character);
}

/**
 * Возврат стандартизированного ответа, когда slash-токен не распознан.
 */
function createNoMatch(reason: SlashNoMatch["reason"]): SlashNoMatch {
  return {
    status: "no-match",
    kind: "none",
    reason,
    isAbsolutePathCandidate: false,
  };
}

/**
 * Выбор опорного индекса символа рядом с курсором для поиска текущего токена.
 */
function getProbeIndex(text: string, cursor: number): number | null {
  if (cursor === text.length) {
    return cursor > 0 ? cursor - 1 : null;
  }

  if (cursor < 0 || cursor >= text.length) {
    return null;
  }

  if (isWhitespaceCharacter(text[cursor] ?? "")) {
    return cursor > 0 && !isWhitespaceCharacter(text[cursor - 1] ?? "") ? cursor - 1 : null;
  }

  return cursor;
}

/**
 * Поиск левой границы токена без выхода за текущий пробельный сегмент.
 */
function findTokenStart(text: string, probeIndex: number): number {
  let index = probeIndex;

  while (index > 0 && !isWhitespaceCharacter(text[index - 1] ?? "")) {
    index -= 1;
  }

  return index;
}

/**
 * Поиск правой границы токена без выхода за текущий пробельный сегмент.
 */
function findTokenEnd(text: string, probeIndex: number): number {
  let index = probeIndex;

  while (index < text.length && !isWhitespaceCharacter(text[index] ?? "")) {
    index += 1;
  }

  return index;
}

/**
 * Классификация уже выделенного slash-токена по типу кандидата.
 */
function classifyTokenKind(token: string): SlashCandidateKind | null {
  if (token.slice(1).includes("/")) {
    return "absolute-path";
  }

  if (SKILL_TOKEN_PATTERN.test(token)) {
    return "skill";
  }

  if (COMMAND_TOKEN_PATTERN.test(token)) {
    return "command";
  }

  return null;
}

/**
 * Создание ответа для команды, skill-токена или absolute path candidate.
 */
function createTokenResult(
  token: string,
  bounds: SlashTokenBounds,
  kind: SlashCandidateKind,
): Exclude<SlashTokenAnalysis, SlashNoMatch> {
  if (kind === "absolute-path") {
    const pathCandidate: SlashAbsolutePathCandidate = {
      status: "absolute-path-candidate",
      kind,
      bounds,
      replacement: bounds,
      token,
      query: token.slice(1),
      isAbsolutePathCandidate: true,
      reason: "contains-path-separator",
    };

    return pathCandidate;
  }

  return {
    status: "match",
    kind,
    bounds,
    replacement: bounds,
    token,
    query: token.slice(1),
    isAbsolutePathCandidate: false,
  };
}

/**
 * Анализ slash-токена вокруг курсора без обращения к runtime Pi.
 */
export function analyzeSlashToken(text: string, cursor: number): SlashTokenAnalysis {
  if (text.length === 0) {
    return createNoMatch("empty-text");
  }

  if (cursor < 0 || cursor > text.length) {
    return createNoMatch("cursor-out-of-range");
  }

  const probeIndex = getProbeIndex(text, cursor);

  if (probeIndex === null) {
    return createNoMatch("cursor-not-on-token");
  }

  const start = findTokenStart(text, probeIndex);
  const end = findTokenEnd(text, probeIndex);

  if (start >= end) {
    return createNoMatch("cursor-not-on-token");
  }

  const token = text.slice(start, end);

  if (!token.startsWith("/")) {
    return createNoMatch("not-slash-token");
  }

  if (token.length === 1) {
    return createNoMatch("token-too-short");
  }

  const kind = classifyTokenKind(token);

  if (kind === null) {
    return createNoMatch("unrecognized-token");
  }

  return createTokenResult(token, { start, end }, kind);
}

/**
 * Нормализация submit-текста в том же виде, который дальше увидит core path.
 */
export function normalizeSubmitText(text: string): string {
  return text.trim();
}

/**
 * Чтение только ведущего токена после trim без обхода всего буфера.
 */
function getLeadingToken(text: string): string {
  let end = 0;

  while (end < text.length && !isWhitespaceCharacter(text[end] ?? "")) {
    end += 1;
  }

  return text.slice(0, end);
}

/**
 * Выбор submit route для path-vs-command boundary без runtime side effects.
 */
export function resolveSubmitRouting(text: string): SubmitRoutingResult {
  const preparedText = normalizeSubmitText(text);
  const leadingToken = getLeadingToken(preparedText);
  const analysis = analyzeSlashToken(leadingToken, leadingToken.length);

  return {
    route:
      analysis.status === "absolute-path-candidate"
        ? "send-user-message"
        : "delegate-core-submit",
    preparedText,
    leadingToken,
    analysis,
  };
}
