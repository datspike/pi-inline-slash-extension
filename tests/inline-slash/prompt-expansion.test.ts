import { describe, expect, test, vi } from "vitest";

import inlineSlashExtension from "../../extensions/inline-slash.js";
import { buildCommandCatalog } from "../../src/inline-slash/command-catalog.js";
import {
  expandInlinePromptTemplates,
  stripYamlFrontmatter,
} from "../../src/inline-slash/prompt-expansion.js";

function sourceInfo(path: string, scope: "user" | "project" = "user") {
  return {
    path,
    source: "top-level",
    scope,
    origin: "top-level",
  } as const;
}

function createCatalog() {
  return buildCommandCatalog([
    {
      name: "ru-clean",
      source: "prompt",
      sourceInfo: sourceInfo("/prompts/ru-clean.md"),
    },
    {
      name: "second",
      source: "prompt",
      sourceInfo: sourceInfo("/prompts/second.md"),
    },
    {
      name: "skill:commit-list",
      source: "skill",
      sourceInfo: sourceInfo("/skills/commit-list/SKILL.md", "project"),
    },
    {
      name: "helper",
      source: "extension",
      sourceInfo: sourceInfo("/extensions/helper.ts", "project"),
    },
  ]);
}

describe("expandInlinePromptTemplates", () => {
  test("ru-clean-mid-line: expands a prompt body and removes YAML frontmatter", () => {
    const result = expandInlinePromptTemplates(
      "Проверь текст /ru-clean перед отправкой.",
      createCatalog(),
      {
        readTemplate: () => "---\ndescription: clean\n---\nИсправь русский текст.",
      },
    );

    expect(result).toEqual({
      text: "Проверь текст Исправь русский текст. перед отправкой.",
      changed: true,
      failures: [],
    });
  });

  test("multiple-and-multiline: expands several prompt tokens across lines", () => {
    const bodies = new Map([
      ["/prompts/ru-clean.md", "Чистый русский."],
      ["/prompts/second.md", "Вторая инструкция."],
    ]);

    const result = expandInlinePromptTemplates(
      "Начало /ru-clean\nПродолжение /second конец",
      createCatalog(),
      { readTemplate: (path) => bodies.get(path) ?? "" },
    );

    expect(result.text).toBe("Начало Чистый русский.\nПродолжение Вторая инструкция. конец");
    expect(result.failures).toEqual([]);
  });

  test("leading-delegation: preserves a leading prompt invocation for core arguments", () => {
    const text = "/ru-clean аргумент\nещё /second";

    expect(expandInlinePromptTemplates(text, createCatalog(), { readTemplate: vi.fn() })).toEqual({
      text,
      changed: false,
      failures: [],
    });
  });

  test("code-protection: leaves fenced blocks and inline code spans unchanged", () => {
    const text = [
      "До /ru-clean",
      "```markdown",
      "/ru-clean",
      "```",
      "Внутри `/ru-clean` после.",
    ].join("\n");

    const result = expandInlinePromptTemplates(text, createCatalog(), {
      readTemplate: () => "BODY",
    });

    expect(result.text).toBe([
      "До BODY",
      "```markdown",
      "/ru-clean",
      "```",
      "Внутри `/ru-clean` после.",
    ].join("\n"));
  });

  test("escape: removes the escape marker without expanding the prompt", () => {
    const result = expandInlinePromptTemplates(
      "Литерал \\/ru-clean и /ru-clean",
      createCatalog(),
      { readTemplate: () => "BODY" },
    );

    expect(result.text).toBe("Литерал /ru-clean и BODY");
  });

  test("leading-escape: preserves escaped prompt and skill tokens for core", () => {
    const text = "\\/ru-clean \\/skill:commit-list";

    expect(expandInlinePromptTemplates(text, createCatalog(), { readTemplate: () => "BODY" })).toEqual({
      text,
      changed: false,
      failures: [],
    });
  });

  test("missing-unknown-skill: leaves failures and unsupported slash tokens unchanged", () => {
    const result = expandInlinePromptTemplates(
      "Путь /ru-clean /unknown /skill:commit-list /home/file.txt",
      createCatalog(),
      { readTemplate: () => { throw new Error("missing file"); } },
    );

    expect(result.text).toBe("Путь /ru-clean /unknown /skill:commit-list /home/file.txt");
    expect(result.changed).toBe(false);
    expect(result.failures).toEqual([
      {
        token: "/ru-clean",
        path: "/prompts/ru-clean.md",
        message: "missing file",
      },
    ]);
  });

  test("frontmatter-without-block: keeps ordinary Markdown unchanged", () => {
    expect(stripYamlFrontmatter("# Заголовок\nТело")).toBe("# Заголовок\nТело");
  });

  test("inline-arguments: consumes natural-language arguments for parameterized prompts", () => {
    const catalog = buildCommandCatalog([
      {
        name: "taskfiles-maintain",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/taskfiles-maintain.md"),
      },
    ]);

    const result = expandInlinePromptTemplates(
      "Перед /taskfiles-maintain сделай инвентаризацию и выбери новую работу",
      catalog,
      {
        readTemplate: () => "Мой запрос: ${@:-инвентаризируй по умолчанию}",
      },
    );

    expect(result.text).toBe("Перед Мой запрос: сделай инвентаризацию и выбери новую работу");
    expect(result.failures).toEqual([]);
  });

  test("inline-arguments: preserves quoted values and stops at the next prompt", () => {
    const catalog = buildCommandCatalog([
      {
        name: "first",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/first.md"),
      },
      {
        name: "second",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/second.md"),
      },
    ]);

    const bodies = new Map([
      ["/prompts/first.md", "FIRST:$1|${@:-fallback}"],
      ["/prompts/second.md", "SECOND"],
    ]);

    const result = expandInlinePromptTemplates(
      "До /first \"два слова\" ещё /second конец",
      catalog,
      { readTemplate: (path) => bodies.get(path) ?? "" },
    );

    expect(result.text).toBe("До FIRST:два слова|два слова ещё SECOND конец");
  });

  test("inline-arguments: keeps newline inside an argument like core Pi", () => {
    const catalog = buildCommandCatalog([
      {
        name: "first",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/first.md"),
      },
    ]);

    const result = expandInlinePromptTemplates(
      "До /first one\ntwo",
      catalog,
      { readTemplate: () => "$1|$2|$@" },
    );

    expect(result.text).toBe("До one\ntwo||one\ntwo");
  });

  test("inline-arguments: normalizes escaped prompt tokens inside consumed arguments", () => {
    const catalog = buildCommandCatalog([
      {
        name: "first",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/first.md"),
      },
      {
        name: "second",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/second.md"),
      },
    ]);

    const result = expandInlinePromptTemplates(
      "До /first one \\/second конец",
      catalog,
      { readTemplate: () => "$@" },
    );

    expect(result.text).toBe("До one /second конец");
  });

  test("inline-arguments: preserves a trailing newline inside the argument", () => {
    const catalog = buildCommandCatalog([
      {
        name: "first",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/first.md"),
      },
    ]);

    const result = expandInlinePromptTemplates(
      "До /first one\n",
      catalog,
      { readTemplate: () => "L<$@>R" },
    );

    expect(result.text).toBe("До L<one\n>R");
  });

  test("inline-arguments: follows core replacement order for placeholder-looking arguments", () => {
    const catalog = buildCommandCatalog([
      {
        name: "first",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/first.md"),
      },
    ]);

    const result = expandInlinePromptTemplates(
      "До /first \"$@\" tail",
      catalog,
      { readTemplate: () => "$1" },
    );

    expect(result.text).toBe("До $@ tail");
  });

  test("inline-arguments: uses the template default when no inline arguments follow", () => {
    const catalog = buildCommandCatalog([
      {
        name: "task",
        source: "prompt",
        sourceInfo: sourceInfo("/prompts/task.md"),
      },
    ]);

    const result = expandInlinePromptTemplates(
      "До /task",
      catalog,
      { readTemplate: () => "TASK:${@:-default request}" },
    );

    expect(result.text).toBe("До TASK:default request");
  });
});

describe("inline extension input handler", () => {
  test("interactive-input: registers a transform-capable handler for user input", async () => {
    const handlers = new Map<string, (event: any, ctx: any) => any>();
    const api = {
      getCommands: () => [
        {
          name: "daily",
          source: "prompt",
          sourceInfo: sourceInfo("package.json"),
        },
      ],
      on: (event: string, handler: (input: any, ctx: any) => any) => handlers.set(event, handler),
    };

    inlineSlashExtension(api as any);
    await handlers.get("session_start")?.(
      { type: "session_start", reason: "startup" },
      { hasUI: false },
    );
    const result = await handlers.get("input")?.(
      {
        type: "input",
        text: "Запусти /daily",
        source: "interactive",
        images: [{ type: "image", data: "x", mimeType: "image/png" }],
      },
      { hasUI: false },
    );

    expect(result.action).toBe("transform");
    expect(result.text.startsWith("Запусти {\n")).toBe(true);
    expect(result.images).toEqual([{ type: "image", data: "x", mimeType: "image/png" }]);
  });

  test("factory-load-safety: defers getCommands until session_start", async () => {
    const handlers = new Map<string, (event: any, ctx: any) => any>();
    let commandsReady = false;
    const api = {
      getCommands: () => {
        if (!commandsReady) {
          throw new Error("Extension runtime not initialized");
        }

        return [
          {
            name: "daily",
            source: "prompt",
            sourceInfo: sourceInfo("package.json"),
          },
        ];
      },
      on: (event: string, handler: (input: any, ctx: any) => any) => handlers.set(event, handler),
    };

    expect(() => inlineSlashExtension(api as any)).not.toThrow();
    expect(await handlers.get("input")?.(
      { type: "input", text: "До /daily", source: "interactive" },
      { hasUI: false },
    )).toEqual({ action: "continue" });

    commandsReady = true;
    await handlers.get("session_start")?.(
      { type: "session_start", reason: "startup" },
      { hasUI: false },
    );

    const result = await handlers.get("input")?.(
      { type: "input", text: "После /daily", source: "interactive" },
      { hasUI: false },
    );

    expect(result.action).toBe("transform");
    expect(result.text.startsWith("После {\n")).toBe(true);
  });

  test("extension-input: does not transform extension-generated input", async () => {
    const handlers = new Map<string, (event: any, ctx: any) => any>();
    const api = {
      getCommands: () => [],
      on: (event: string, handler: (input: any, ctx: any) => any) => handlers.set(event, handler),
    };

    inlineSlashExtension(api as any);

    expect(await handlers.get("input")?.(
      { type: "input", text: "generated /daily", source: "extension" },
      { hasUI: false },
    )).toEqual({ action: "continue" });
  });
});
