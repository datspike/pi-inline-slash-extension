export type SlashCandidateKind = "command" | "skill" | "absolute-path";

export type SlashNoMatchReason =
  | "empty-text"
  | "cursor-out-of-range"
  | "cursor-not-on-token"
  | "not-slash-token"
  | "token-too-short"
  | "unrecognized-token";

export interface SlashTokenBounds {
  start: number;
  end: number;
}

export interface SlashTokenBase {
  bounds: SlashTokenBounds;
  replacement: SlashTokenBounds;
  token: string;
  query: string;
  isAbsolutePathCandidate: boolean;
}

export interface SlashCommandMatch extends SlashTokenBase {
  status: "match";
  kind: "command";
}

export interface SlashSkillMatch extends SlashTokenBase {
  status: "match";
  kind: "skill";
}

export interface SlashAbsolutePathCandidate extends SlashTokenBase {
  status: "absolute-path-candidate";
  kind: "absolute-path";
  isAbsolutePathCandidate: true;
  reason: "contains-path-separator";
}

export interface SlashNoMatch {
  status: "no-match";
  kind: "none";
  reason: SlashNoMatchReason;
  isAbsolutePathCandidate: false;
}

export type SlashTokenAnalysis =
  | SlashCommandMatch
  | SlashSkillMatch
  | SlashAbsolutePathCandidate
  | SlashNoMatch;
