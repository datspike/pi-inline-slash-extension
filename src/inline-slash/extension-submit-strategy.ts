import type { InlineSlashSubmitStrategy } from "./editor.js";
import { resolveSubmitRouting } from "./submit-routing.js";

export interface InlineSlashSubmitTransport {
  sendUserMessage?: (text: string) => void;
}

/**
 * Runtime submit strategy для absolute path bypass без изменения core slash поведения.
 */
export function createInlineSlashSubmitStrategy(
  transport: InlineSlashSubmitTransport,
): InlineSlashSubmitStrategy {
  return ({ text, editor, delegateCoreSubmit }) => {
    const routing = resolveSubmitRouting(text);

    if (routing.route !== "send-user-message") {
      delegateCoreSubmit(routing.preparedText);
      return;
    }

    if (typeof transport.sendUserMessage !== "function") {
      throw new Error("Inline slash extension requires api.sendUserMessage for absolute path submit bypass.");
    }

    editor.addToHistory?.(routing.preparedText);
    transport.sendUserMessage(routing.preparedText);
  };
}
