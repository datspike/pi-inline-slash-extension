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
  test("public-contract: includes only extension/prompt/skill commands from public API and does not pretend to be a built-in catalog", () => {
    /** public-contract: built-ins outside `pi.getCommands()` must stay explicitly out of scope. */
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

  test("malformed-inputs: ignores entries without a name, with an unsupported source, or with a duplicate alias", () => {
    /** malformed-inputs: invalid entries must not break the local catalog. */
    const catalog = buildCommandCatalog([
      {
        name: "gsd",
        source: "extension",
        description: "First entry",
        sourceInfo: sourceInfo("project", ".pi/extensions/inline-slash.ts"),
      },
      {
        name: "/gsd",
        source: "extension",
        description: "Duplicate via slash",
        sourceInfo: sourceInfo("project", ".pi/extensions/duplicate.ts"),
      },
      { name: "", source: "skill", description: "Empty name", sourceInfo: sourceInfo("project", ".pi/skills/empty/SKILL.md") },
      { source: "prompt", description: "Missing name", sourceInfo: sourceInfo("user", "/home/spike/.pi/prompts/unnamed.md") },
      { name: "broken", source: "builtin", description: "Unsupported source", sourceInfo: sourceInfo("temporary", "<builtin:broken>") },
      { name: "two words", source: "prompt", description: "Name with spaces", sourceInfo: sourceInfo("user", "/home/spike/.pi/prompts/two-words.md") },
      { name: "missing-source-info", source: "extension", description: "Missing sourceInfo" },
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
        description: "First entry",
        source: "extension",
        sourceInfo: sourceInfo("project", ".pi/extensions/inline-slash.ts"),
      },
    ]);
  });

  test("skill-short-alias: adds a plain alias for skill:* without changing the canonical insertText", () => {
    /** skill-short-alias: the short alias is only for lookup, not for changing submit form. */
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
