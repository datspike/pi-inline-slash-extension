import { describe, expect, test, vi } from "vitest";

import { buildCommandCatalog } from "../../src/inline-slash/command-catalog.js";
import { InlineSlashProvider } from "../../src/inline-slash/provider.js";
import type {
  AutocompleteApplyResult,
  AutocompleteItemLike,
  AutocompleteProviderLike,
  AutocompleteRequestOptions,
  AutocompleteSuggestions,
  SlashTokenAnalysis,
} from "../../src/inline-slash/types.js";

function sourceInfo(scope: "user" | "project" | "temporary", path: string) {
  return {
    path,
    source: "top-level",
    scope,
    origin: "top-level",
  } as const;
}

/**
 * Создание локального каталога для provider tests.
 */
function createCatalog() {
  return buildCommandCatalog([
    {
      name: "gsd",
      source: "extension",
      description: "GSD helper",
      sourceInfo: sourceInfo("project", ".pi/extensions/inline-slash.ts"),
    },
    {
      name: "daily",
      source: "prompt",
      description: "Daily prompt",
      sourceInfo: sourceInfo("user", "/home/spike/.pi/prompts/daily.md"),
    },
    {
      name: "skill:create-skill",
      source: "skill",
      description: "Create skill",
      sourceInfo: sourceInfo("project", ".pi/skills/create-skill/SKILL.md"),
    },
    {
      name: "skill:commit-list",
      source: "skill",
      description: "Create commit plan",
      sourceInfo: sourceInfo("project", ".pi/skills/commit-list/SKILL.md"),
    },
  ]);
}

/**
 * Создание delegate provider с шпионами на оба метода.
 */
function createDelegate(result?: AutocompleteSuggestions | null): AutocompleteProviderLike & {
  getSuggestionsSpy: ReturnType<typeof vi.fn>;
  applyCompletionSpy: ReturnType<typeof vi.fn>;
} {
  const getSuggestionsSpy = vi.fn(
    (
      _lines: string[],
      _cursorLine: number,
      _cursorCol: number,
      _options?: AutocompleteRequestOptions,
    ) => result ?? null,
  );
  const applyCompletionSpy = vi.fn(
    (
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      item: AutocompleteItemLike,
      prefix: string,
    ): AutocompleteApplyResult => ({
      lines: [`delegate:${prefix}:${item.value}`],
      cursorLine,
      cursorCol: cursorCol + 1,
    }),
  );

  return {
    getSuggestionsSpy,
    applyCompletionSpy,
    getSuggestions: getSuggestionsSpy,
    applyCompletion: applyCompletionSpy,
  };
}

describe("InlineSlashProvider.getSuggestions", () => {
  test("inline-gsd: предлагает /gsd внутри строки и не трогает delegate", () => {
    /** inline-gsd: mid-line slash command должен работать без core provider. */
    const delegate = createDelegate({
      items: [{ value: "settings", label: "settings" }],
      prefix: "/gs",
    });
    const provider = new InlineSlashProvider({ catalog: createCatalog(), delegate });
    const line = "Сначала проверь /gs";

    expect(provider.getSuggestions([line], 0, line.length)).toEqual({
      items: [{ value: "/gsd", label: "/gsd", description: "GSD helper" }],
      prefix: "/gs",
    });
    expect(delegate.getSuggestionsSpy).not.toHaveBeenCalled();
  });

  test("inline-skill: предлагает /skill:create-skill внутри строки", () => {
    /** inline-skill: skill token фильтруется по полному `skill:*` alias. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });
    const line = "Нужно включить /skill:create";

    expect(provider.getSuggestions([line], 0, line.length)).toEqual({
      items: [
        {
          value: "/skill:create-skill",
          label: "/skill:create-skill",
          description: "Create skill",
        },
      ],
      prefix: "/skill:create",
    });
  });

  test("inline-skill-short-alias: short /commit-list матчит canonical skill entry", () => {
    /** inline-skill-short-alias: short skill alias должен находить canonical `/skill:*` completion. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });
    const line = "Нужно включить /commit";

    expect(provider.getSuggestions([line], 0, line.length)).toEqual({
      items: [
        {
          value: "/skill:commit-list",
          label: "/skill:commit-list",
          description: "Create commit plan",
        },
      ],
      prefix: "/commit",
    });
  });

  test("second-line-gsd: предлагает /gsd на второй строке без delegate path", () => {
    /** second-line-gsd: первая строка не должна быть обязательным условием. */
    const delegate = createDelegate({
      items: [{ value: "settings", label: "settings" }],
      prefix: "/gs",
    });
    const provider = new InlineSlashProvider({ catalog: createCatalog(), delegate });
    const lines = ["Первая строка", "вторая /gs"];

    expect(provider.getSuggestions(lines, 1, lines[1].length)).toEqual({
      items: [{ value: "/gsd", label: "/gsd", description: "GSD helper" }],
      prefix: "/gs",
    });
    expect(delegate.getSuggestionsSpy).not.toHaveBeenCalled();
  });

  test("zero-match: возвращает null для неизвестного inline prefix", () => {
    /** zero-match: отсутствие совпадений не должно давать ложную подсказку. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });

    expect(provider.getSuggestions(["текст /zzz"], 0, "текст /zzz".length)).toBeNull();
  });

  test("absolute-path-suppression: подавляет подсказки для absolute path candidate", () => {
    /** absolute-path-suppression: /home/... не должен становиться slash command. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });

    expect(provider.getSuggestions(["/home/spike/file.ts"], 0, "/home/spike/file.ts".length)).toBeNull();
  });

  test("start-of-line-delegate: на первой строке делегирует в core provider", () => {
    /** start-of-line-delegate: корректный upstream path остаётся у core autocomplete. */
    const delegateResult = {
      items: [{ value: "settings", label: "settings", description: "Open settings" }],
      prefix: "/se",
    };
    const delegate = createDelegate(delegateResult);
    const provider = new InlineSlashProvider({ catalog: createCatalog(), delegate });

    expect(provider.getSuggestions(["/se"], 0, 3)).toEqual(delegateResult);
    expect(delegate.getSuggestionsSpy).toHaveBeenCalledWith(["/se"], 0, 3, {});
  });

  test("start-of-line-delegate-options: прокидывает options в core provider", () => {
    /** start-of-line-delegate-options: upstream provider должен получать force/signal без потерь. */
    const delegateResult = {
      items: [{ value: "settings", label: "settings", description: "Open settings" }],
      prefix: "/se",
    };
    const delegate = createDelegate(delegateResult);
    const provider = new InlineSlashProvider({ catalog: createCatalog(), delegate });
    const options: AutocompleteRequestOptions = { force: true };

    expect(provider.getSuggestions(["/se"], 0, 3, options)).toEqual(delegateResult);
    expect(delegate.getSuggestionsSpy).toHaveBeenCalledWith(["/se"], 0, 3, options);
  });

  test("missing-delegate-start-of-line: возвращает null, если делегировать некуда", () => {
    /** missing-delegate-start-of-line: отсутствие delegate не должно ронять provider. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });

    expect(provider.getSuggestions(["/gs"], 0, 3)).toBeNull();
  });

  test("malformed-bounds: игнорирует битые token bounds от classifier seam", () => {
    /** malformed-bounds: некорректный replacement span не должен порождать suggestions. */
    const malformedAnalyze = vi.fn(
      (): SlashTokenAnalysis => ({
        status: "match",
        kind: "command",
        bounds: { start: 7, end: 3 },
        replacement: { start: 7, end: 3 },
        token: "/gs",
        query: "gs",
        isAbsolutePathCandidate: false,
      }),
    );
    const provider = new InlineSlashProvider({
      catalog: createCatalog(),
      analyzeToken: malformedAnalyze,
    });

    expect(provider.getSuggestions(["текст /gs"], 0, "текст /gs".length)).toBeNull();
  });
});

describe("InlineSlashProvider.applyCompletion", () => {
  test("inline-apply-gsd: заменяет только текущий token и сохраняет ведущий slash", () => {
    /** inline-apply-gsd: соседний текст до и после токена должен остаться нетронутым. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });
    const line = "Сначала /gs потом";

    expect(
      provider.applyCompletion(
        [line],
        0,
        line.indexOf("/gs") + 3,
        { value: "/gsd", label: "/gsd" },
        "/gs",
      ),
    ).toEqual({
      lines: ["Сначала /gsd потом"],
      cursorLine: 0,
      cursorCol: "Сначала /gsd".length,
    });
  });

  test("inline-apply-skill: добавляет completion в конце буфера и не теряет slash", () => {
    /** inline-apply-skill: completion в конце строки получает хвостовой пробел для аргументов. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });
    const line = "Включи /skill:create";

    expect(
      provider.applyCompletion(
        [line],
        0,
        line.length,
        { value: "/skill:create-skill", label: "/skill:create-skill" },
        "/skill:create",
      ),
    ).toEqual({
      lines: ["Включи /skill:create-skill "],
      cursorLine: 0,
      cursorCol: "Включи /skill:create-skill ".length,
    });
  });

  test("start-of-line-apply-delegate: сохраняет delegate path для первого-line core scenario", () => {
    /** start-of-line-apply-delegate: start-of-message apply остаётся у upstream provider. */
    const delegate = createDelegate({
      items: [{ value: "settings", label: "settings" }],
      prefix: "/se",
    });
    const provider = new InlineSlashProvider({ catalog: createCatalog(), delegate });

    expect(
      provider.applyCompletion(
        ["/se"],
        0,
        3,
        { value: "settings", label: "settings" },
        "/se",
      ),
    ).toEqual({
      lines: ["delegate:/se:settings"],
      cursorLine: 0,
      cursorCol: 4,
    });
    expect(delegate.applyCompletionSpy).toHaveBeenCalledWith(
      ["/se"],
      0,
      3,
      { value: "settings", label: "settings" },
      "/se",
    );
  });

  test("malformed-bounds-no-op: при битом replacement span не портит текст", () => {
    /** malformed-bounds-no-op: ошибочный seam должен приводить к безопасному no-op. */
    const malformedAnalyze = vi.fn(
      (): SlashTokenAnalysis => ({
        status: "match",
        kind: "command",
        bounds: { start: 99, end: 100 },
        replacement: { start: 99, end: 100 },
        token: "/gs",
        query: "gs",
        isAbsolutePathCandidate: false,
      }),
    );
    const provider = new InlineSlashProvider({
      catalog: createCatalog(),
      analyzeToken: malformedAnalyze,
    });

    expect(
      provider.applyCompletion(
        ["текст /gs"],
        0,
        "текст /gs".length,
        { value: "/gsd", label: "/gsd" },
        "/gs",
      ),
    ).toEqual({
      lines: ["текст /gs"],
      cursorLine: 0,
      cursorCol: "текст /gs".length,
    });
  });
});
