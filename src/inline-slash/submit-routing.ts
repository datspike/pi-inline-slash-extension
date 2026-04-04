import { analyzeSlashToken } from "./classifier.js";
import type { SubmitRoutingResult } from "./types.js";

const WHITESPACE_PATTERN = /\s/;

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

  while (end < text.length && !WHITESPACE_PATTERN.test(text[end] ?? "")) {
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
