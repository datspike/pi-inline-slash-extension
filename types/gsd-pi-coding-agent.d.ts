declare module "@gsd/pi-coding-agent" {
  export interface ExtensionUIContext {
    setEditorComponent(
      factory:
        | ((tui: unknown, theme: unknown, keybindings: unknown) => CustomEditor)
        | undefined,
    ): void;
  }

  export interface SessionStartContext {
    hasUI: boolean;
    ui: ExtensionUIContext;
  }

  export interface ExtensionAPI {
    on(
      event: "session_start" | string,
      handler: (event: unknown, ctx: SessionStartContext) => void,
    ): void;
    getCommands(): Array<{
      name: string;
      source: "extension" | "prompt" | "skill";
      description?: string;
      location?: "user" | "project" | "path";
      path?: string;
    }>;
    sendUserMessage(content: string): void;
  }

  export class CustomEditor {
    constructor(...args: unknown[]);
    getText(): string;
    getLines?(): string[];
    getCursor?(): { line: number; col: number };
    handleInput(data: string): void;
    setAutocompleteProvider(provider: any): void;
    addToHistory?(text: string): void;
    onSubmit?: (text: string) => void;
    onChange?: (text: string) => void;
  }
}
