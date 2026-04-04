import { describe, expect, test } from "vitest";

import { PUBLIC_COMMAND_CATALOG_NOTE, buildCommandCatalog } from "../../src/inline-slash/command-catalog.js";

describe("buildCommandCatalog", () => {
  test("public-contract: включает только extension/prompt/skill из public API и не притворяется built-in catalog", () => {
    /** public-contract: built-ins вне `pi.getCommands()` должны быть явно вне scope. */
    const catalog = buildCommandCatalog([
      { name: "gsd", source: "extension", description: "GSD helper" },
      { name: "daily", source: "prompt", description: "Daily prompt" },
      {
        name: "skill:create-skill",
        source: "skill",
        description: "Create skill",
        location: "project",
        path: ".gsd/skills/create-skill/SKILL.md",
      },
    ]);

    expect(catalog).toEqual({
      scope: "extension-api-public",
      note: PUBLIC_COMMAND_CATALOG_NOTE,
      entries: [
        {
          name: "daily",
          queryKey: "daily",
          label: "/daily",
          insertText: "/daily",
          description: "Daily prompt",
          source: "prompt",
          location: undefined,
          path: undefined,
        },
        {
          name: "gsd",
          queryKey: "gsd",
          label: "/gsd",
          insertText: "/gsd",
          description: "GSD helper",
          source: "extension",
          location: undefined,
          path: undefined,
        },
        {
          name: "skill:create-skill",
          queryKey: "skill:create-skill",
          label: "/skill:create-skill",
          insertText: "/skill:create-skill",
          description: "Create skill",
          source: "skill",
          location: "project",
          path: ".gsd/skills/create-skill/SKILL.md",
        },
      ],
    });
  });

  test("malformed-inputs: игнорирует записи без имени, с unsupported source и duplicate alias", () => {
    /** malformed-inputs: невалидные записи не должны ломать локальный каталог. */
    const catalog = buildCommandCatalog([
      { name: "gsd", source: "extension", description: "Первая запись" },
      { name: "/gsd", source: "extension", description: "Дубликат через slash" },
      { name: "", source: "skill", description: "Пустое имя" },
      { source: "prompt", description: "Без имени" },
      { name: "broken", source: "builtin", description: "Unsupported source" },
      { name: "two words", source: "prompt", description: "Имя с пробелом" },
      null,
      undefined,
    ]);

    expect(catalog.entries).toEqual([
      {
        name: "gsd",
        queryKey: "gsd",
        label: "/gsd",
        insertText: "/gsd",
        description: "Первая запись",
        source: "extension",
        location: undefined,
        path: undefined,
      },
    ]);
  });
});
