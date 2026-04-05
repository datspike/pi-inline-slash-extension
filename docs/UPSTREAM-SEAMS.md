# upstream editor seam request

## Why

The current extension solves the shipped scope without forking core, but inline slash autocomplete still has to touch part of the editor runtime seam that is not documented as a public extension contract.

## What already sits on public API

- `ctx.ui.setEditorComponent(...)`
- `CustomEditor`
- `api.getCommands()`
- `api.sendUserMessage(...)`
- `Editor.getText()`
- `Editor.getLines()`
- `Editor.getCursor()`
- `Editor.setAutocompleteProvider(...)`

## What is still a gray area

- forced autocomplete triggering after mid-line input;
- refreshing an already open autocomplete popup outside the start-of-message slash flow;
- submit interception before the slash dispatcher decides that `/home/...` is a command.

## Minimal public seam

### editor autocomplete control

A public contract is needed at the `CustomEditor` or `EditorComponent` level:

- `refreshAutocomplete(): void`
- `openAutocomplete(): void`
- `closeAutocomplete(): void`
- `isAutocompleteOpen(): boolean`

That is enough for the extension to stop touching private editor methods.

### submit classification hook

An extension hook is needed before slash dispatch:

- `before_submit_dispatch(text) -> { route: "default" | "send-user-message" }`

or a narrower editor-level callback:

- `transformSubmit(text) -> { kind: "delegate" | "user-message", text: string }`

## What this seam would unlock

- the extension would stop depending on private editor internals;
- inline slash would become portable across Pi versions;
- the catalog could be extended to built-ins only after a separate public API for built-in commands exists;
- package-level extension behavior would become predictable across the Pi ecosystem.

## What this patch is not asking for

- built-in slash catalog via `pi.getCommands()`;
- changes to unknown-command semantics;
- a full rewrite of the current slash UX.
