import type {
  InlineSlashCatalog,
  InlineSlashCatalogEntry,
  PublicSlashCommandInfo,
  PublicSlashCommandSource,
} from "./types.js";

const SUPPORTED_SOURCES = new Set<PublicSlashCommandSource>(["extension", "prompt", "skill"]);

export const PUBLIC_COMMAND_CATALOG_NOTE =
  "Каталог строится только из public `pi.getCommands()` и сознательно не притворяется полным built-in slash catalog.";

/**
 * Проверка, что значение является непустой строкой.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Нормализация имени команды из public API к локальному alias без ведущего slash.
 */
function normalizeCommandName(name: string): string {
  return name.trim().replace(/^\/+/, "");
}

/**
 * Преобразование сырых данных `pi.getCommands()` в локальную запись каталога.
 */
function toCatalogEntry(rawCommand: unknown): InlineSlashCatalogEntry | null {
  if (!rawCommand || typeof rawCommand !== "object") {
    return null;
  }

  const command = rawCommand as Partial<PublicSlashCommandInfo>;

  if (!isNonEmptyString(command.name)) {
    return null;
  }

  if (!isNonEmptyString(command.source)) {
    return null;
  }

  if (!SUPPORTED_SOURCES.has(command.source as PublicSlashCommandSource)) {
    return null;
  }

  const name = normalizeCommandName(command.name);

  if (name.length === 0 || /\s/.test(name)) {
    return null;
  }

  const description = isNonEmptyString(command.description) ? command.description.trim() : undefined;

  return {
    name,
    queryKey: name.toLowerCase(),
    label: `/${name}`,
    insertText: `/${name}`,
    description,
    source: command.source as PublicSlashCommandSource,
    location: command.location,
    path: command.path,
  };
}

/**
 * Сборка truth-first каталога только из public extension/prompt/skill команд.
 */
export function buildCommandCatalog(commands: readonly unknown[]): InlineSlashCatalog {
  const entries: InlineSlashCatalogEntry[] = [];
  const seenAliases = new Set<string>();

  for (const rawCommand of commands) {
    const entry = toCatalogEntry(rawCommand);

    if (!entry || seenAliases.has(entry.queryKey)) {
      continue;
    }

    seenAliases.add(entry.queryKey);
    entries.push(entry);
  }

  entries.sort((left, right) => left.queryKey.localeCompare(right.queryKey));

  return {
    scope: "extension-api-public",
    note: PUBLIC_COMMAND_CATALOG_NOTE,
    entries,
  };
}
