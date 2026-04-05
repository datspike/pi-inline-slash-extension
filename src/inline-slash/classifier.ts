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
 * Check whether a character is a whitespace token separator.
 */
function isWhitespaceCharacter(character: string): boolean {
  return WHITESPACE_PATTERN.test(character);
}

/**
 * Return the standard no-match response when a slash token is not recognized.
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
 * Pick the anchor character index near the cursor for current-token lookup.
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
 * Find the left token boundary without leaving the current whitespace-delimited segment.
 */
function findTokenStart(text: string, probeIndex: number): number {
  let index = probeIndex;

  while (index > 0 && !isWhitespaceCharacter(text[index - 1] ?? "")) {
    index -= 1;
  }

  return index;
}

/**
 * Find the right token boundary without leaving the current whitespace-delimited segment.
 */
function findTokenEnd(text: string, probeIndex: number): number {
  let index = probeIndex;

  while (index < text.length && !isWhitespaceCharacter(text[index] ?? "")) {
    index += 1;
  }

  return index;
}

/**
 * Classify an already isolated slash token by candidate kind.
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
 * Build the analysis result for a command, skill token, or absolute-path candidate.
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
 * Analyze the slash token around the cursor without touching Pi runtime state.
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
 * Normalize submit text into the same shape that core submit will see.
 */
export function normalizeSubmitText(text: string): string {
  return text.trim();
}

/**
 * Read only the leading token after trim without scanning the whole buffer.
 */
function getLeadingToken(text: string): string {
  let end = 0;

  while (end < text.length && !isWhitespaceCharacter(text[end] ?? "")) {
    end += 1;
  }

  return text.slice(0, end);
}

/**
 * Select the submit route for the path-vs-command boundary without runtime side effects.
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
