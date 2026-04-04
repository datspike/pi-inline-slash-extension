import { describe, expect, test } from "vitest";

import { normalizeSubmitText, resolveSubmitRouting } from "../../src/inline-slash/submit-routing.js";

describe("normalizeSubmitText", () => {
  test("submit-trim-parity: повторяет core trim для submit boundary", () => {
    /** submit-trim-parity: helper должен смотреть на тот же текст, который потом увидит core path. */
    expect(normalizeSubmitText("  /home/spike/file.ts\n")).toBe("/home/spike/file.ts");
  });
});

describe("resolveSubmitRouting", () => {
  test("path-home-bypass: leading /home/... идёт через send-user-message", () => {
    /** path-home-bypass: абсолютный путь не должен уходить в delegated slash dispatch. */
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

  test("path-tmp-bypass-after-trim: leading /tmp/... с пробелами тоже идёт через send-user-message", () => {
    /** path-tmp-bypass-after-trim: helper обязан повторять submit trim и затем делать routing по leading token. */
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

  test("delegate-gsd-command: /gsd auto остаётся delegated core submit", () => {
    /** delegate-gsd-command: реальная slash-команда не должна случайно bypass'иться как path. */
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

  test("delegate-skill-command: /skill:create-skill demo остаётся delegated core submit", () => {
    /** delegate-skill-command: skill token с аргументом обязан остаться на core path. */
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

  test("delegate-unknown-command-shape: /unknown остаётся delegated core submit", () => {
    /** delegate-unknown-command-shape: syntactic command shape не даёт права bypass'ить core submit. */
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

  test("delegate-malformed-slash-shape: неподдерживаемый slash token делегируется", () => {
    /** delegate-malformed-slash-shape: malformed slash input не должен превращаться в path bypass. */
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

  test("delegate-lone-slash: одинокий slash делегируется без исключения", () => {
    /** delegate-lone-slash: malformed slash input должен безопасно уйти в delegated path. */
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

  test("delegate-plain-text: обычный текст остаётся delegated core submit", () => {
    /** delegate-plain-text: helper не должен вводить новую эвристику для неслашового submit. */
    expect(resolveSubmitRouting("обычный текст")).toEqual({
      route: "delegate-core-submit",
      preparedText: "обычный текст",
      leadingToken: "обычный",
      analysis: {
        status: "no-match",
        kind: "none",
        reason: "not-slash-token",
        isAbsolutePathCandidate: false,
      },
    });
  });

  test("delegate-empty-after-trim: пустой и whitespace-only submit делегируется", () => {
    /** delegate-empty-after-trim: trim boundary не должен бросать исключение на пустом буфере. */
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

  test("leading-token-only-on-long-buffer: helper читает только leading context на multiline buffer", () => {
    /** leading-token-only-on-long-buffer: trailing lines не должны менять route для leading absolute path. */
    expect(resolveSubmitRouting("\n\n/home/spike/file.ts\nвторая строка\n/gsd")).toEqual({
      route: "send-user-message",
      preparedText: "/home/spike/file.ts\nвторая строка\n/gsd",
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
