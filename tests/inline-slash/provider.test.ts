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
 * Build the local catalog used by provider tests.
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
 * Build a delegate provider with spies on both methods.
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
  test("inline-gsd: suggests /gsd inside a line and does not touch the delegate", () => {
    /** inline-gsd: a mid-line slash command must work without the core provider. */
    const delegate = createDelegate({
      items: [{ value: "settings", label: "settings" }],
      prefix: "/gs",
    });
    const provider = new InlineSlashProvider({ catalog: createCatalog(), delegate });
    const line = "First check /gs";

    expect(provider.getSuggestions([line], 0, line.length)).toEqual({
      items: [{ value: "/gsd", label: "/gsd", description: "GSD helper" }],
      prefix: "/gs",
    });
    expect(delegate.getSuggestionsSpy).not.toHaveBeenCalled();
  });

  test("inline-skill: suggests /skill:create-skill inside a line", () => {
    /** inline-skill: the skill token is filtered by the full `skill:*` alias. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });
    const line = "Need to enable /skill:create";

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

  test("inline-skill-short-alias: short /commit-list matches the canonical skill entry", () => {
    /** inline-skill-short-alias: the short skill alias must resolve to canonical `/skill:*` completion. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });
    const line = "Need to enable /commit";

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

  test("second-line-gsd: suggests /gsd on the second line without the delegate path", () => {
    /** second-line-gsd: the first line must not be a required condition. */
    const delegate = createDelegate({
      items: [{ value: "settings", label: "settings" }],
      prefix: "/gs",
    });
    const provider = new InlineSlashProvider({ catalog: createCatalog(), delegate });
    const lines = ["First line", "second /gs"];

    expect(provider.getSuggestions(lines, 1, lines[1].length)).toEqual({
      items: [{ value: "/gsd", label: "/gsd", description: "GSD helper" }],
      prefix: "/gs",
    });
    expect(delegate.getSuggestionsSpy).not.toHaveBeenCalled();
  });

  test("zero-match: returns null for an unknown inline prefix", () => {
    /** zero-match: missing matches must not produce a false suggestion. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });

    expect(provider.getSuggestions(["text /zzz"], 0, "text /zzz".length)).toBeNull();
  });

  test("absolute-path-suppression: suppresses suggestions for an absolute-path candidate", () => {
    /** absolute-path-suppression: /home/... must not become a slash command. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });

    expect(provider.getSuggestions(["/home/spike/file.ts"], 0, "/home/spike/file.ts".length)).toBeNull();
  });

  test("start-of-line-delegate: delegates to the core provider on the first line", () => {
    /** start-of-line-delegate: the valid upstream path must stay with core autocomplete. */
    const delegateResult = {
      items: [{ value: "settings", label: "settings", description: "Open settings" }],
      prefix: "/se",
    };
    const delegate = createDelegate(delegateResult);
    const provider = new InlineSlashProvider({ catalog: createCatalog(), delegate });

    expect(provider.getSuggestions(["/se"], 0, 3)).toEqual(delegateResult);
    expect(delegate.getSuggestionsSpy).toHaveBeenCalledWith(["/se"], 0, 3, {});
  });

  test("start-of-line-delegate-options: forwards options to the core provider", () => {
    /** start-of-line-delegate-options: the upstream provider must receive force/signal unchanged. */
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

  test("missing-delegate-start-of-line: returns null when there is nothing to delegate to", () => {
    /** missing-delegate-start-of-line: a missing delegate must not crash the provider. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });

    expect(provider.getSuggestions(["/gs"], 0, 3)).toBeNull();
  });

  test("malformed-bounds: ignores broken token bounds from the classifier seam", () => {
    /** malformed-bounds: an invalid replacement span must not produce suggestions. */
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

    expect(provider.getSuggestions(["text /gs"], 0, "text /gs".length)).toBeNull();
  });
});

describe("InlineSlashProvider.applyCompletion", () => {
  test("inline-apply-gsd: replaces only the current token and preserves the leading slash", () => {
    /** inline-apply-gsd: neighboring text before and after the token must stay untouched. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });
    const line = "First /gs then";

    expect(
      provider.applyCompletion(
        [line],
        0,
        line.indexOf("/gs") + 3,
        { value: "/gsd", label: "/gsd" },
        "/gs",
      ),
    ).toEqual({
      lines: ["First /gsd then"],
      cursorLine: 0,
      cursorCol: "First /gsd".length,
    });
  });

  test("inline-apply-skill: appends completion at buffer end and preserves the slash", () => {
    /** inline-apply-skill: a completion at line end must get a trailing space for arguments. */
    const provider = new InlineSlashProvider({ catalog: createCatalog() });
    const line = "Enable /skill:create";

    expect(
      provider.applyCompletion(
        [line],
        0,
        line.length,
        { value: "/skill:create-skill", label: "/skill:create-skill" },
        "/skill:create",
      ),
    ).toEqual({
      lines: ["Enable /skill:create-skill "],
      cursorLine: 0,
      cursorCol: "Enable /skill:create-skill ".length,
    });
  });

  test("start-of-line-apply-delegate: preserves the delegate path for the first-line core scenario", () => {
    /** start-of-line-apply-delegate: start-of-message apply must remain with the upstream provider. */
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

  test("malformed-bounds-no-op: does not damage text when the replacement span is broken", () => {
    /** malformed-bounds-no-op: a broken seam must result in a safe no-op. */
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
        ["text /gs"],
        0,
        "text /gs".length,
        { value: "/gsd", label: "/gsd" },
        "/gs",
      ),
    ).toEqual({
      lines: ["text /gs"],
      cursorLine: 0,
      cursorCol: "text /gs".length,
    });
  });
});
