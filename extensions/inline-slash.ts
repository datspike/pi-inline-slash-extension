import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";

import { buildCommandCatalog } from "../src/inline-slash/command-catalog.js";
import {
  createInlineSlashEditorClass,
  createInlineSlashSubmitStrategy,
} from "../src/inline-slash/editor.js";
import { expandInlinePromptTemplates } from "../src/inline-slash/prompt-expansion.js";
import type { InlineSlashCatalog } from "../src/inline-slash/types.js";

/**
 * Package entrypoint for the inline slash editor wrapper and prompt expansion.
 */
export default function inlineSlashExtension(api: ExtensionAPI): void {
  let catalog: InlineSlashCatalog | null = null;

  api.on("input", (event, ctx) => {
    if (event.source === "extension" || !catalog) {
      return { action: "continue" };
    }

    const result = expandInlinePromptTemplates(event.text, catalog);

    if (result.failures.length > 0 && ctx.hasUI) {
      const failedTokens = [...new Set(result.failures.map((failure) => failure.token))].join(", ");
      ctx.ui.notify(`Inline prompt expansion skipped for ${failedTokens}.`, "warning");
    }

    if (!result.changed) {
      return { action: "continue" };
    }

    return {
      action: "transform",
      text: result.text,
      ...(event.images ? { images: event.images } : {}),
    };
  });

  api.on("session_start", (_event, ctx) => {
    catalog = buildCommandCatalog(api.getCommands());

    if (!ctx.hasUI) {
      return;
    }

    const InlineSlashEditor = createInlineSlashEditorClass(CustomEditor as any, {
      catalog,
      submitStrategy: createInlineSlashSubmitStrategy(api),
    });

    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new InlineSlashEditor(tui, theme, keybindings) as any,
    );
  });
}
