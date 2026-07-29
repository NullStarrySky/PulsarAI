# Interactive Document Resources

Interactive documents extend Markdown with block-level structure and Sandbox macros. Persisted data remains serializable, while `InteractiveDocument` wraps that data with CRUD, compilation, and `toString()` behavior.

## Ownership

- Domain data and runtime wrapper: `domain/interactive-document.ts`
- Main-screen demo seed: `application/interactive-document-demo.ts`
- Single-column document editor: `presentation/InteractiveDocumentWorkspacePage.vue`
- Workspace and empty-state registration: `presentation/register-interactive-document-workspace.ts`

## Block Model

Every block has `id`, `type`, `name`, `description`, `hidden`, and an optional message `role`. An unset role resolves to `assistant`.

- Text blocks contain a Markdown string array, an active content index, and bound variable block ids.
- Variable blocks contain a JSON-compatible primitive, object, or array plus a renderer id.
- Component blocks contain an external component id, JSON-compatible props, and a Markdown fallback.

Hidden blocks do not participate in compilation. Deleting a variable block also removes its id from text-block bindings.

## Runtime API

`InteractiveDocument` exposes:

- `getBlock`, `createBlock`, `updateBlock`, and `deleteBlock`
- `setBlockHidden` and `moveBlock`
- text-version add, update, remove, and active-version operations
- `compileDetailed()` for Markdown plus block-scoped errors
- `compile()` and `toString()` for compiled Markdown

Custom variable renderers and a synchronous external component resolver can be passed when the wrapper is created. Built-in renderers are automatic, plain text, Markdown list, and JSON.

The built-in renderer set also includes `slider` and `toggle`. These retain simple Markdown stringification while allowing the document workspace to present purpose-built numeric and boolean controls.

## Macro Compilation

Compilation delegates `{{...}}` expressions to `src/features/Sandbox/domain/sandbox.ts`. Visible content blocks are grouped by role and emitted under `# system_prompt`, `# user_prompt`, or `# assistant_prompt` headings. This lets a root Plugin `context.imd` compile directly into the Conversation context-structure format.

Variable bindings are exposed by block id through `$variables` and `variables`. Identifier-safe ids and names are also exposed directly. A text block with no variable ids can access every visible variable; otherwise it receives only its explicit bindings.

When a block fails to resolve, the original Markdown is retained and the error is returned from `compileDetailed()`.

## Reading Workspace

The workspace deliberately has no block directory and no separate compiled preview. Editing happens in one centered document flow so the IMD remains readable like ordinary Markdown:

- Markdown blocks are full-width document sections. Their header contains the title, compile switch, conversation-style page control, collapse affordance, and a menu for page/block operations.
- The active Markdown page is the only visible content surface. Milkdown edits it in place with block handles enabled.
- Consecutive variable blocks are grouped into a responsive horizontal grid. They use lower visual weight and expose name, id, inferred value type, and a truncated renderer selector.
- Variable values choose compact controls from the renderer and value shape: string/number inputs, toggle, slider, line-list editor, or JSON CodeMirror.
- Every block exposes a compact role selector; `默认 · assistant` leaves the role field unset.
- Descriptions stay out of the reading flow until explicitly opened from a block menu.
- Component references remain compatible as full-width fallback sections, but no longer own a side preview.

## Test Surface

The interactive-document workspace is registered as the main workspace empty component, so closing all tabs exposes the live block editor. The same page is also registered for `resourceType: "interactive-doc"` for later persisted-resource integration.
