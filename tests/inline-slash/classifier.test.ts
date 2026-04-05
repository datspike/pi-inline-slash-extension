import { describe, expect, test } from "vitest";

import { analyzeSlashToken } from "../../src/inline-slash/classifier.js";

describe("analyzeSlashToken", () => {
  test("inline-gsd: recognizes a mid-line slash command and preserves bounds", () => {
    /** inline-gsd: a mid-line command must still replace only the current token. */
    const text = "First check /gsd";
    const start = text.indexOf("/gsd");

    expect(analyzeSlashToken(text, text.length)).toEqual({
      status: "match",
      kind: "command",
      bounds: { start, end: start + 4 },
      replacement: { start, end: start + 4 },
      token: "/gsd",
      query: "gsd",
      isAbsolutePathCandidate: false,
    });
  });

  test("inline-skill: recognizes a mid-line skill token with a leading slash", () => {
    /** inline-skill: the skill token must not lose `/` and must be classified separately. */
    const text = "Need to enable /skill:create-skill";
    const start = text.indexOf("/skill:create-skill");
    const token = "/skill:create-skill";

    expect(analyzeSlashToken(text, text.length)).toEqual({
      status: "match",
      kind: "skill",
      bounds: { start, end: start + token.length },
      replacement: { start, end: start + token.length },
      token,
      query: "skill:create-skill",
      isAbsolutePathCandidate: false,
    });
  });

  test("second-line-gsd: recognizes a slash command on the second line", () => {
    /** second-line-gsd: a newline must remain a valid token boundary. */
    const text = "First line\nsecond /gsd";
    const start = text.indexOf("/gsd");

    expect(analyzeSlashToken(text, text.length)).toEqual({
      status: "match",
      kind: "command",
      bounds: { start, end: start + 4 },
      replacement: { start, end: start + 4 },
      token: "/gsd",
      query: "gsd",
      isAbsolutePathCandidate: false,
    });
  });

  test("start-of-line-regression: preserves start-of-line /gsd auto", () => {
    /** start-of-line-regression: the first command token must not break because of a trailing argument. */
    const text = "/gsd auto";

    expect(analyzeSlashToken(text, "/gsd".length)).toEqual({
      status: "match",
      kind: "command",
      bounds: { start: 0, end: 4 },
      replacement: { start: 0, end: 4 },
      token: "/gsd",
      query: "gsd",
      isAbsolutePathCandidate: false,
    });
  });

  test("start-of-line-skill-arg: preserves /skill:create-skill demo as a skill token", () => {
    /** start-of-line-skill-arg: a trailing argument must not change the first-token classification. */
    const text = "/skill:create-skill demo";
    const token = "/skill:create-skill";

    expect(analyzeSlashToken(text, token.length)).toEqual({
      status: "match",
      kind: "skill",
      bounds: { start: 0, end: token.length },
      replacement: { start: 0, end: token.length },
      token,
      query: "skill:create-skill",
      isAbsolutePathCandidate: false,
    });
  });

  test("path-home-candidate: marks /home/... as an absolute-path candidate", () => {
    /** path-home-candidate: an absolute path must not turn into a slash command. */
    const text = "/home/spike/file.ts";

    expect(analyzeSlashToken(text, text.length)).toEqual({
      status: "absolute-path-candidate",
      kind: "absolute-path",
      bounds: { start: 0, end: text.length },
      replacement: { start: 0, end: text.length },
      token: text,
      query: "home/spike/file.ts",
      isAbsolutePathCandidate: true,
      reason: "contains-path-separator",
    });
  });

  test("path-tmp-candidate: marks /tmp/... as an absolute-path candidate", () => {
    /** path-tmp-candidate: a short absolute path must also suppress slash autocomplete. */
    const text = "/tmp/log.txt";

    expect(analyzeSlashToken(text, text.length)).toEqual({
      status: "absolute-path-candidate",
      kind: "absolute-path",
      bounds: { start: 0, end: text.length },
      replacement: { start: 0, end: text.length },
      token: text,
      query: "tmp/log.txt",
      isAbsolutePathCandidate: true,
      reason: "contains-path-separator",
    });
  });

  test("unknown-command-shape-boundary: syntactically valid /unknown remains a command match", () => {
    /** unknown-command-shape-boundary: the classifier distinguishes token shape, not runtime catalog presence. */
    expect(analyzeSlashToken("/unknown", "/unknown".length)).toEqual({
      status: "match",
      kind: "command",
      bounds: { start: 0, end: "/unknown".length },
      replacement: { start: 0, end: "/unknown".length },
      token: "/unknown",
      query: "unknown",
      isAbsolutePathCandidate: false,
    });
  });

  test("malformed-unknown-shape-boundary: returns no-match for an unsupported slash token", () => {
    /** malformed-unknown-shape-boundary: a slash token with an invalid shape must remain no-match. */
    expect(analyzeSlashToken("/bad_token", "/bad_token".length)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "unrecognized-token",
      isAbsolutePathCandidate: false,
    });
  });

  test("lone-slash-boundary: returns no-match for a lone slash", () => {
    /** lone-slash-boundary: a single slash must not be guessed as either a command or a path. */
    expect(analyzeSlashToken("/", 1)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "token-too-short",
      isAbsolutePathCandidate: false,
    });
  });

  test("malformed-empty-text: returns no-match for an empty buffer", () => {
    /** malformed-empty-text: empty text must not trigger guessed spans. */
    expect(analyzeSlashToken("", 0)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "empty-text",
      isAbsolutePathCandidate: false,
    });
  });

  test("malformed-cursor-out-of-range: returns no-match for an invalid cursor", () => {
    /** malformed-cursor-out-of-range: an out-of-range cursor must not throw. */
    expect(analyzeSlashToken("/gsd", 99)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "cursor-out-of-range",
      isAbsolutePathCandidate: false,
    });
  });

  test("malformed-token-without-slash-prefix: returns no-match for a regular word", () => {
    /** malformed-token-without-slash-prefix: the classifier must not pretend it found a slash token. */
    const text = "plain text";

    expect(analyzeSlashToken(text, text.length)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "not-slash-token",
      isAbsolutePathCandidate: false,
    });
  });
});
