# Conversation Generation

`Conversation` owns the visible message path and the fixed startup sequence for generation. `conversation-store.ts` creates the empty assistant container first, then delegates one run to `application/conversation-generation.ts`.

The generation sequence is:

1. Convert the active container path to role-preserving AI SDK messages.
2. Resolve default Feature API grants and the active character package override, then use the built Capability objects as the Sandbox base environment.
3. Ask `Plugin` to scan enabled package plugins, evaluate inserted-resource conditions in `Sandbox`, resolve effective containers, and assemble the resource environment.
4. Add the active path, empty container, empty message, registered Skill/MCP tool names, and component-interaction API to the final environment.
5. Read the selected `context-structure` resource. Headings named `system_prompt`, `user_prompt`, and `assistant_prompt` define message roles; `[[chat]]` splices the active path without flattening roles. With no selected structure, the fallback is `[[chat]]`. The generated Feature API reference is prepended as a system message.
6. Execute the highest-priority non-empty plugin generation process. The process can call `api.runAgent(messages?)`, authorized Feature APIs, `api.askUserWithComponent(...)`, or `api.renderComponent(componentId, props)`. An empty process runs the default Agent.
7. Normalize the process result into the already-created assistant message and persist generation and environment metadata.

Character packages persist an optional `capabilities` map. An omitted map inherits the default configuration; a package map overrides defaults feature by feature, and an explicit empty list denies that Feature.

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

Typing `/` at the beginning of the composer opens the enabled Plugin action list. The menu uses the resource name as the command and the resource description as its supporting copy. Selecting another action replaces the current selection, so each user message can store at most one `ActionPart`; that part is always the first message part and renders before attachments or prompt text.

`conversation-store.ts` resolves the action only from the latest user container and passes its identity plus the prompt to `runConversationGeneration`. The Plugin environment exposes the command as `action`, the remaining user text as `prompt`, and all available action resources as `actions`. An inserted selected action that passes its structured conditions supplies the temporary process source for that generation only.

## Composer Toolbar

The footer tool buttons are rendered from the appearance store's `composerToolbar` layout. `left` and `right` control visible order; `unused` hides tools. The appearance settings page uses the same catalog in a non-interactive composer-shaped drag editor, including pointer dragging for mobile.

## File Attachments

Conversation file attachments follow the AI SDK `ModelMessage` file-part format documented at `https://ai-sdk.dev/docs/reference/ai-sdk-core/model-message`. Files are stored on `ChatMessage.parts` with `type: "file"`, raw base64 `data`, an IANA `mediaType`, optional `filename`, and local display `size`.

`application/message-attachment.ts` converts browser files into serializable parts and reconstructs object URLs for preview or download. `conversation-store.ts` converts a user message with attachments into AI SDK array content:

- optional `{ type: "text", text }`;
- one `{ type: "file", data, mediaType, filename }` entry per attachment.

The composer keeps unsent attachments above the editor as a horizontal attachment group. Existing user messages expose the same attachment strip plus add/remove controls; changes persist with the message container and participate in later generation paths.
