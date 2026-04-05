import { describe, expect, test } from "vitest";

import { normalizeSubmitText, resolveSubmitRouting } from "../../src/inline-slash/classifier.js";

describe("normalizeSubmitText", () => {
  test("submit-trim-parity: mirrors core trim for the submit boundary", () => {
    /** submit-trim-parity: the helper must look at the same text that the core path will later see. */
    expect(normalizeSubmitText("  /home/spike/file.ts\n")).toBe("/home/spike/file.ts");
  });
});

describe("resolveSubmitRouting", () => {
  test("path-home-bypass: leading /home/... goes through send-user-message", () => {
    /** path-home-bypass: an absolute path must not go through delegated slash dispatch. */
    expect(resolveSubmitRouting("/home/spike/file.ts")).toEqual({
      route: "send-user-message",
      preparedText: "/home/spike/file.ts",
      leadingToken: "/home/spike/file.ts",
      analysis: {
        status: "absolute-path-candidate",
        kind: "absolute-path",
        bounds: { start: 0, end: "/home/spike/file.ts".length },
        replacement: { start: 0, end: "/home/spike/file.ts".length },
        token: "/home/spike/file.ts",
        query: "home/spike/file.ts",
        isAbsolutePathCandidate: true,
        reason: "contains-path-separator",
      },
    });
  });

  test("path-tmp-bypass-after-trim: leading /tmp/... with surrounding whitespace still goes through send-user-message", () => {
    /** path-tmp-bypass-after-trim: the helper must mirror submit trim and then route by the leading token. */
    expect(resolveSubmitRouting("  \n /tmp/log.txt  ")).toEqual({
      route: "send-user-message",
      preparedText: "/tmp/log.txt",
      leadingToken: "/tmp/log.txt",
      analysis: {
        status: "absolute-path-candidate",
        kind: "absolute-path",
        bounds: { start: 0, end: "/tmp/log.txt".length },
        replacement: { start: 0, end: "/tmp/log.txt".length },
        token: "/tmp/log.txt",
        query: "tmp/log.txt",
        isAbsolutePathCandidate: true,
        reason: "contains-path-separator",
      },
    });
  });

  test("delegate-gsd-command: /gsd auto stays delegated core submit", () => {
    /** delegate-gsd-command: a real slash command must not be bypassed as a path by accident. */
    expect(resolveSubmitRouting("/gsd auto")).toEqual({
      route: "delegate-core-submit",
      preparedText: "/gsd auto",
      leadingToken: "/gsd",
      analysis: {
        status: "match",
        kind: "command",
        bounds: { start: 0, end: 4 },
        replacement: { start: 0, end: 4 },
        token: "/gsd",
        query: "gsd",
        isAbsolutePathCandidate: false,
      },
    });
  });

  test("delegate-skill-command: /skill:create-skill demo stays delegated core submit", () => {
    /** delegate-skill-command: a skill token with an argument must remain on the core path. */
    expect(resolveSubmitRouting(" /skill:create-skill demo ")).toEqual({
      route: "delegate-core-submit",
      preparedText: "/skill:create-skill demo",
      leadingToken: "/skill:create-skill",
      analysis: {
        status: "match",
        kind: "skill",
        bounds: { start: 0, end: "/skill:create-skill".length },
        replacement: { start: 0, end: "/skill:create-skill".length },
        token: "/skill:create-skill",
        query: "skill:create-skill",
        isAbsolutePathCandidate: false,
      },
    });
  });

  test("delegate-unknown-command-shape: /unknown stays delegated core submit", () => {
    /** delegate-unknown-command-shape: syntactic command shape alone must not authorize bypassing core submit. */
    expect(resolveSubmitRouting("/unknown")).toEqual({
      route: "delegate-core-submit",
      preparedText: "/unknown",
      leadingToken: "/unknown",
      analysis: {
        status: "match",
        kind: "command",
        bounds: { start: 0, end: "/unknown".length },
        replacement: { start: 0, end: "/unknown".length },
        token: "/unknown",
        query: "unknown",
        isAbsolutePathCandidate: false,
      },
    });
  });

  test("delegate-malformed-slash-shape: an unsupported slash token is delegated", () => {
    /** delegate-malformed-slash-shape: malformed slash input must not turn into path bypass. */
    expect(resolveSubmitRouting("/bad_token rest")).toEqual({
      route: "delegate-core-submit",
      preparedText: "/bad_token rest",
      leadingToken: "/bad_token",
      analysis: {
        status: "no-match",
        kind: "none",
        reason: "unrecognized-token",
        isAbsolutePathCandidate: false,
      },
    });
  });

  test("delegate-lone-slash: a lone slash is delegated without throwing", () => {
    /** delegate-lone-slash: malformed slash input must safely go through the delegated path. */
    expect(resolveSubmitRouting("/")).toEqual({
      route: "delegate-core-submit",
      preparedText: "/",
      leadingToken: "/",
      analysis: {
        status: "no-match",
        kind: "none",
        reason: "token-too-short",
        isAbsolutePathCandidate: false,
      },
    });
  });

  test("delegate-plain-text: plain text stays delegated core submit", () => {
    /** delegate-plain-text: the helper must not add a new heuristic for non-slash submit. */
    expect(resolveSubmitRouting("plain text")).toEqual({
      route: "delegate-core-submit",
      preparedText: "plain text",
      leadingToken: "plain",
      analysis: {
        status: "no-match",
        kind: "none",
        reason: "not-slash-token",
        isAbsolutePathCandidate: false,
      },
    });
  });

  test("delegate-empty-after-trim: empty and whitespace-only submit is delegated", () => {
    /** delegate-empty-after-trim: the trim boundary must not throw on an empty buffer. */
    expect(resolveSubmitRouting("  \n ")).toEqual({
      route: "delegate-core-submit",
      preparedText: "",
      leadingToken: "",
      analysis: {
        status: "no-match",
        kind: "none",
        reason: "empty-text",
        isAbsolutePathCandidate: false,
      },
    });
  });

  test("leading-token-only-on-long-buffer: the helper reads only the leading context on a multiline buffer", () => {
    /** leading-token-only-on-long-buffer: trailing lines must not change the route for a leading absolute path. */
    expect(resolveSubmitRouting("\n\n/home/spike/file.ts\nsecond line\n/gsd")).toEqual({
      route: "send-user-message",
      preparedText: "/home/spike/file.ts\nsecond line\n/gsd",
      leadingToken: "/home/spike/file.ts",
      analysis: {
        status: "absolute-path-candidate",
        kind: "absolute-path",
        bounds: { start: 0, end: "/home/spike/file.ts".length },
        replacement: { start: 0, end: "/home/spike/file.ts".length },
        token: "/home/spike/file.ts",
        query: "home/spike/file.ts",
        isAbsolutePathCandidate: true,
        reason: "contains-path-separator",
      },
    });
  });
});
