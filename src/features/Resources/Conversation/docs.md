# Conversation Generation

`Conversation` owns the visible message path and the fixed startup sequence for generation. `conversation-store.ts` creates the empty assistant container first, then delegates one run to `application/conversation-generation.ts`.

The generation sequence is:

1. Convert the active container path to role-preserving AI SDK messages.
2. Resolve default Feature API grants and the active character package override, then use the built Capability objects as the minimal Sandbox base environment.
3. Ask `Plugin` to index enabled files, scoped container declarations, memberships, and root entry conventions without evaluating or flattening resources.
4. Add the active path, empty container, empty message, registered Skill/MCP tool names, and component-interaction API to the same minimal environment.
5. Compile the first root `context.imd`. Repeatable SFC `prompt_template` blocks preserve their roles, `[[chat]]` splices the active path, and `<@...>` links only explicitly requested resources. With no entry document, the fallback is `[[chat]]`. The generated Feature API reference remains a prepended system message.
6. Preprocess and execute the selected `action/` JavaScript file or highest-priority non-empty root `generation.js` with a source-scoped guarded `ref`. The process can call `api.runAgent(messages?)`, authorized Feature APIs, `api.askUserWithComponent(...)`, or `api.renderComponent(componentId, props)`. An empty or absent process runs the default Agent.
7. Normalize the process result into the already-created assistant message and persist generation metadata, resolved resource IDs, and linker diagnostics.

Character packages persist an optional `capabilities` map. An omitted map inherits the default configuration; a package map overrides defaults feature by feature, and an explicit empty list denies that Feature.

The immutable `PulsarAI` package is the owner of project-Agent conversations. A project conversation persists an optional `projectPackageId` pointing at the normal character package it may inspect and modify. The workspace empty state does not persist a conversation until the first message is sent; it then creates a `PulsarAI` conversation, derives a collision-safe title from the selected project name, opens its normal conversation workspace, and sends through this same generation sequence.

The current `Conversation` record is available in the generation environment as `conversation`. During regeneration, the store searches backward from the selected assistant page for the most recent completed page. A page is complete when it has content and either no generation metadata or a finished `timeUsed` value. That page is exposed as `beforeGenerationMessage` and inserted as a system message asking the model to reduce unnecessary repetition; if no complete page exists, it is omitted.

While a conversation is generating, its workspace tab receives the generic UI `loading` status and renders a spinner even when another tab is active. The status is cleared in the generation `finally` path.

Generation components register through `presentation/generation-component-registry.ts`. A component emits `resolve` with its result or `cancel`; `GenerationComponentDialog.vue` keeps the generation promise pending while the user interacts with it. Components added with `api.renderComponent` are stored as message parts and rendered below the message markdown through the same registry.

Skill and MCP features register AI SDK tools through `Agent/application/agent-extension-registry.ts`. The default Agent includes all registered tools in the same run rather than using a second generation path.

The default Agent also owns the built-in `askUser` tool. Its Zod input contains one question and 1-8 predefined options. During conversation generation the tool opens the registered `agent.ask-user` generation component and waits for either a predefined option or the final free-response dialog. The selected value is returned to the same `ToolLoopAgent` run as a normal tool result, so the model can continue from the user's answer.

## Conversation Renderers

Each conversation persists a `rendererId`. The right-sidebar conversation menu switches between the standard chat renderer and `NovelConversationRenderer.vue`.

The novel renderer treats every assistant container on the active path as a chapter. It provides previous/next controls and a chapter selector, keeps the closest preceding user container as a collapsed prompt, and centers the reading surface with mobile-specific spacing and typography. Generation components attached to the active assistant message continue to render inside the chapter.

A conversation marked as the package template stores the same `rendererId`. `createConversation` copies that renderer while cloning the template's message path, so new conversations inherit the chosen reading mode without a separate package-level setting.

## Composer Actions

Typing `/` at the beginning of the composer opens the enabled Plugin action list. The menu uses the resource name as the command and the owning plugin name as supporting copy. Selecting another action replaces the current selection, so each user message can store at most one `ActionPart`; that part is always the first message part and renders before attachments or prompt text.

`conversation-store.ts` resolves the action only from the latest user container and passes its identity plus the prompt to `runConversationGeneration`. The minimal environment exposes the command as `action` and the remaining user text as `prompt`. The selected conventional `action/` file supplies the temporary process source for that generation only.

## Composer Toolbar

The footer tool buttons are rendered from the appearance store's `composerToolbar` layout. `left` and `right` control visible order; `unused` hides tools. The appearance settings page uses the same catalog in a non-interactive composer-shaped drag editor, including pointer dragging for mobile.

## File Attachments

Conversation file attachments follow the AI SDK `ModelMessage` file-part format documented at `https://ai-sdk.dev/docs/reference/ai-sdk-core/model-message`. Files are stored on `ChatMessage.parts` with `type: "file"`, raw base64 `data`, an IANA `mediaType`, optional `filename`, and local display `size`.

`application/message-attachment.ts` converts browser files into serializable parts and reconstructs object URLs for preview or download. `conversation-store.ts` converts a user message with attachments into AI SDK array content:

- optional `{ type: "text", text }`;
- one `{ type: "file", data, mediaType, filename }` entry per attachment.

The composer keeps unsent attachments above the editor as a horizontal attachment group. Existing user messages expose the same attachment strip plus add/remove controls; changes persist with the message container and participate in later generation paths.
