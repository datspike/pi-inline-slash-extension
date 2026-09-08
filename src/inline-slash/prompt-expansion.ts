import { readFileSync } from "node:fs";

import type { InlineSlashCatalog, InlineSlashCatalogEntry } from "./types.js";

export interface PromptExpansionFailure {
  token: string;
  path: string;
  message: string;
}

export interface PromptExpansionResult {
  text: string;
  changed: boolean;
  failures: PromptExpansionFailure[];
}

export interface PromptExpansionOptions {
  readTemplate?: (path: string) => string;
}

interface TextRange {
  start: number;
  end: number;
}

type CachedTemplate =
  | { body: string }
  | { error: PromptExpansionFailure };

const DEFAULT_TEMPLATE_READER = (path: string): string => readFileSync(path, "utf8");

/** Remove one YAML frontmatter block while preserving the Markdown body verbatim. */
export function stripYamlFrontmatter(text: string): string {
  return text.replace(
    /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/,
    "",
  );
}

function lineFence(line: string): { marker: "`" | "~"; length: number; closing: boolean } | null {
  const match = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(line);

  if (!match) {
    return null;
  }

  const run = match[1] ?? "";
  const rest = match[2] ?? "";
  const marker = run[0] as "`" | "~";

  return {
    marker,
    length: run.length,
    closing: rest.trim().length === 0,
  };
}

function findFencedCodeRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  let fenceStart: number | null = null;
  let fenceMarker: "`" | "~" | null = null;
  let fenceLength = 0;
  let lineStart = 0;

  while (lineStart <= text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd).replace(/\r$/, "");
    const fence = lineFence(line);

    if (fenceStart === null) {
      if (fence) {
        fenceStart = lineStart;
        fenceMarker = fence.marker;
        fenceLength = fence.length;
      }
    } else if (fence && fence.closing && fence.marker === fenceMarker && fence.length >= fenceLength) {
      ranges.push({ start: fenceStart, end: newline === -1 ? text.length : newline + 1 });
      fenceStart = null;
      fenceMarker = null;
      fenceLength = 0;
    }

    if (newline === -1) {
      break;
    }

    lineStart = newline + 1;
  }

  if (fenceStart !== null) {
    ranges.push({ start: fenceStart, end: text.length });
  }

  return ranges;
}

function rangeAt(ranges: readonly TextRange[], offset: number): TextRange | null {
  return ranges.find((range) => offset >= range.start && offset < range.end) ?? null;
}

function findInlineCodeRanges(text: string, fencedRanges: readonly TextRange[]): TextRange[] {
  const ranges: TextRange[] = [];
  let offset = 0;

  while (offset < text.length) {
    const fence = rangeAt(fencedRanges, offset);

    if (fence) {
      offset = fence.end;
      continue;
    }

    if (text[offset] !== "`") {
      offset += 1;
      continue;
    }

    let runLength = 1;

    while (text[offset + runLength] === "`") {
      runLength += 1;
    }

    const marker = "`".repeat(runLength);
    let closing = text.indexOf(marker, offset + runLength);

    while (closing !== -1) {
      const before = text[closing - 1];
      let closingRunLength = 0;

      while (text[closing + closingRunLength] === "`") {
        closingRunLength += 1;
      }

      if (closingRunLength === runLength && before !== "\\") {
        break;
      }

      closing = text.indexOf(marker, closing + 1);
    }

    if (closing === -1) {
      offset += runLength;
      continue;
    }

    ranges.push({ start: offset, end: closing + runLength });
    offset = closing + runLength;
  }

  return ranges;
}

function protectedRanges(text: string): TextRange[] {
  const fencedRanges = findFencedCodeRanges(text);

  return [...fencedRanges, ...findInlineCodeRanges(text, fencedRanges)]
    .sort((left, right) => left.start - right.start);
}

function promptEntries(catalog: InlineSlashCatalog): Map<string, InlineSlashCatalogEntry> {
  const entries = new Map<string, InlineSlashCatalogEntry>();

  for (const entry of catalog.entries) {
    if (entry.source === "prompt" && entry.sourceInfo.path.length > 0) {
      entries.set(entry.name.toLowerCase(), entry);
    }
  }

  return entries;
}

function compactError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return "unable to read prompt template";
}

/**
 * Expand exact public prompt-command tokens outside Markdown code regions.
 * The first known prompt token remains untouched for Pi core argument handling.
 */
export function expandInlinePromptTemplates(
  text: string,
  catalog: InlineSlashCatalog,
  options: PromptExpansionOptions = {},
): PromptExpansionResult {
  const entries = promptEntries(catalog);
  const firstToken = /\S+/.exec(text)?.[0];

  if (firstToken && firstToken.startsWith("/") && !firstToken.startsWith("\\/") && entries.has(firstToken.slice(1).toLowerCase())) {
    return { text, changed: false, failures: [] };
  }

  if (entries.size === 0 && !text.includes("\\/")) {
    return { text, changed: false, failures: [] };
  }

  const protectedTextRanges = protectedRanges(text);
  const readTemplate = options.readTemplate ?? DEFAULT_TEMPLATE_READER;
  const cache = new Map<string, CachedTemplate>();
  const failures: PromptExpansionFailure[] = [];
  const parts: string[] = [];
  let cursor = 0;
  let changed = false;

  for (const match of text.matchAll(/\S+/g)) {
    const token = match[0] ?? "";
    const start = match.index ?? 0;
    const end = start + token.length;

    if (rangeAt(protectedTextRanges, start)) {
      continue;
    }

    if (token.startsWith("\\/")) {
      parts.push(text.slice(cursor, start), token.slice(1));
      cursor = end;
      changed = true;
      continue;
    }

    if (!token.startsWith("/")) {
      continue;
    }

    const entry = entries.get(token.slice(1).toLowerCase());

    if (!entry) {
      continue;
    }

    let cached = cache.get(entry.sourceInfo.path);

    if (!cached) {
      try {
        cached = { body: stripYamlFrontmatter(readTemplate(entry.sourceInfo.path)) };
      } catch (error) {
        const failure: PromptExpansionFailure = {
          token,
          path: entry.sourceInfo.path,
          message: compactError(error),
        };
        cached = { error: failure };
        failures.push(failure);
      }

      cache.set(entry.sourceInfo.path, cached);
    } else if ("error" in cached) {
      failures.push({ ...cached.error, token });
    }

    if ("error" in cached) {
      continue;
    }

    parts.push(text.slice(cursor, start), cached.body);
    cursor = end;
    changed = true;
  }

  if (!changed) {
    return { text, changed: false, failures };
  }

  parts.push(text.slice(cursor));
  return { text: parts.join(""), changed: true, failures };
}
