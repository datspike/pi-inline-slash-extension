import { describe, expect, test } from "vitest";

import { analyzeSlashToken } from "../../src/inline-slash/classifier.js";

describe("analyzeSlashToken", () => {
  test("inline-gsd: распознаёт mid-line slash command и сохраняет bounds", () => {
    /** inline-gsd: mid-line command остаётся заменой только текущего токена. */
    const text = "Сначала проверь /gsd";
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

  test("inline-skill: распознаёт mid-line skill token с ведущим slash", () => {
    /** inline-skill: skill token не теряет / и классифицируется отдельно. */
    const text = "Нужно включить /skill:create-skill";
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

  test("second-line-gsd: распознаёт slash command на второй строке", () => {
    /** second-line-gsd: перевод строки остаётся допустимой границей токена. */
    const text = "Первая строка\nвторая /gsd";
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

  test("start-of-line-regression: сохраняет start-of-line /gsd auto", () => {
    /** start-of-line-regression: первый токен команды не ломается из-за аргумента после пробела. */
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

  test("start-of-line-skill-arg: сохраняет /skill:create-skill demo как skill token", () => {
    /** start-of-line-skill-arg: trailing argument не должен менять классификацию первого токена. */
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

  test("path-home-candidate: помечает /home/... как absolute path candidate", () => {
    /** path-home-candidate: абсолютный путь не должен превращаться в slash-команду. */
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

  test("path-tmp-candidate: помечает /tmp/... как absolute path candidate", () => {
    /** path-tmp-candidate: короткий абсолютный путь тоже подавляет slash autocomplete. */
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

  test("unknown-command-shape-boundary: синтаксически валидный /unknown остаётся command match", () => {
    /** unknown-command-shape-boundary: classifier различает форму токена, а не наличие runtime-команды в каталоге. */
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

  test("malformed-unknown-shape-boundary: возвращает no-match для неподдерживаемого slash token", () => {
    /** malformed-unknown-shape-boundary: slash с недопустимой формой должен оставаться no-match. */
    expect(analyzeSlashToken("/bad_token", "/bad_token".length)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "unrecognized-token",
      isAbsolutePathCandidate: false,
    });
  });

  test("lone-slash-boundary: возвращает no-match для одинокого slash", () => {
    /** lone-slash-boundary: single slash не должен угадываться ни как команда, ни как path. */
    expect(analyzeSlashToken("/", 1)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "token-too-short",
      isAbsolutePathCandidate: false,
    });
  });

  test("malformed-empty-text: возвращает no-match для пустого буфера", () => {
    /** malformed-empty-text: пустой текст не даёт угадывать span. */
    expect(analyzeSlashToken("", 0)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "empty-text",
      isAbsolutePathCandidate: false,
    });
  });

  test("malformed-cursor-out-of-range: возвращает no-match для невалидного cursor", () => {
    /** malformed-cursor-out-of-range: выход за пределы строки не должен бросать исключение. */
    expect(analyzeSlashToken("/gsd", 99)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "cursor-out-of-range",
      isAbsolutePathCandidate: false,
    });
  });

  test("malformed-token-without-slash-prefix: возвращает no-match для обычного слова", () => {
    /** malformed-token-without-slash-prefix: classifier не делает вид, что нашёл slash-токен. */
    const text = "обычный текст";

    expect(analyzeSlashToken(text, text.length)).toEqual({
      status: "no-match",
      kind: "none",
      reason: "not-slash-token",
      isAbsolutePathCandidate: false,
    });
  });
});
