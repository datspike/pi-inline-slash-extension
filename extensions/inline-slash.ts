import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";

import { buildCommandCatalog } from "../src/inline-slash/command-catalog.js";
import {
  createInlineSlashEditorClass,
  createInlineSlashSubmitStrategy,
} from "../src/inline-slash/editor.js";

/**
 * Package entrypoint для inline slash editor wrapper.
 */
export default function inlineSlashExtension(api: ExtensionAPI): void {
  api.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) {
      return;
    }

    const catalog = buildCommandCatalog(api.getCommands());
    const InlineSlashEditor = createInlineSlashEditorClass(CustomEditor as any, {
      catalog,
      submitStrategy: createInlineSlashSubmitStrategy(api),
    });

    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new InlineSlashEditor(tui, theme, keybindings) as any,
    );
  });
}
