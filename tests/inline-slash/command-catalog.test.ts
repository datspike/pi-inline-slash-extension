import { describe, expect, test } from "vitest";

import { PUBLIC_COMMAND_CATALOG_NOTE, buildCommandCatalog } from "../../src/inline-slash/command-catalog.js";

function sourceInfo(scope: "user" | "project" | "temporary", path: string) {
  return {
    path,
    source: "top-level",
    scope,
    origin: "top-level",
  } as const;
}

describe("buildCommandCatalog", () => {
  test("public-contract: включает только extension/prompt/skill из public API и не притворяется built-in catalog", () => {
    /** public-contract: built-ins вне `pi.getCommands()` должны быть явно вне scope. */
    const catalog = buildCommandCatalog([
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
    ]);

    expect(catalog).toEqual({
      scope: "extension-api-public",
      note: PUBLIC_COMMAND_CATALOG_NOTE,
      entries: [
        {
          name: "daily",
          queryKey: "daily",
          matchKeys: ["daily"],
          label: "/daily",
          insertText: "/daily",
          description: "Daily prompt",
          source: "prompt",
          sourceInfo: sourceInfo("user", "/home/spike/.pi/prompts/daily.md"),
        },
        {
          name: "gsd",
          queryKey: "gsd",
          matchKeys: ["gsd"],
          label: "/gsd",
          insertText: "/gsd",
          description: "GSD helper",
          source: "extension",
          sourceInfo: sourceInfo("project", ".pi/extensions/inline-slash.ts"),
        },
        {
          name: "skill:create-skill",
          queryKey: "skill:create-skill",
          matchKeys: ["skill:create-skill", "create-skill"],
          label: "/skill:create-skill",
          insertText: "/skill:create-skill",
          description: "Create skill",
          source: "skill",
          sourceInfo: sourceInfo("project", ".pi/skills/create-skill/SKILL.md"),
        },
      ],
    });
  });

  test("malformed-inputs: игнорирует записи без имени, с unsupported source и duplicate alias", () => {
    /** malformed-inputs: невалидные записи не должны ломать локальный каталог. */
    const catalog = buildCommandCatalog([
      {
        name: "gsd",
        source: "extension",
        description: "Первая запись",
        sourceInfo: sourceInfo("project", ".pi/extensions/inline-slash.ts"),
      },
      {
        name: "/gsd",
        source: "extension",
        description: "Дубликат через slash",
        sourceInfo: sourceInfo("project", ".pi/extensions/duplicate.ts"),
      },
      { name: "", source: "skill", description: "Пустое имя", sourceInfo: sourceInfo("project", ".pi/skills/empty/SKILL.md") },
      { source: "prompt", description: "Без имени", sourceInfo: sourceInfo("user", "/home/spike/.pi/prompts/unnamed.md") },
      { name: "broken", source: "builtin", description: "Unsupported source", sourceInfo: sourceInfo("temporary", "<builtin:broken>") },
      { name: "two words", source: "prompt", description: "Имя с пробелом", sourceInfo: sourceInfo("user", "/home/spike/.pi/prompts/two-words.md") },
      { name: "missing-source-info", source: "extension", description: "Нет sourceInfo" },
      null,
      undefined,
    ]);

    expect(catalog.entries).toEqual([
      {
        name: "gsd",
        queryKey: "gsd",
        matchKeys: ["gsd"],
        label: "/gsd",
        insertText: "/gsd",
        description: "Первая запись",
        source: "extension",
        sourceInfo: sourceInfo("project", ".pi/extensions/inline-slash.ts"),
      },
    ]);
  });

  test("skill-short-alias: добавляет plain alias для skill:* без смены canonical insertText", () => {
    /** skill-short-alias: short alias нужен только для поиска, а не для смены submit form. */
    const catalog = buildCommandCatalog([
      {
        name: "skill:commit-list",
        source: "skill",
        description: "Commit planner",
        sourceInfo: sourceInfo("project", ".pi/skills/commit-list/SKILL.md"),
      },
    ]);

    expect(catalog.entries).toEqual([
      {
        name: "skill:commit-list",
        queryKey: "skill:commit-list",
        matchKeys: ["skill:commit-list", "commit-list"],
        label: "/skill:commit-list",
        insertText: "/skill:commit-list",
        description: "Commit planner",
        source: "skill",
        sourceInfo: sourceInfo("project", ".pi/skills/commit-list/SKILL.md"),
      },
    ]);
  });
});
