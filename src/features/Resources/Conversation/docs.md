# Conversation Generation

`Conversation` owns the visible message path and the fixed startup sequence for generation. `conversation-store.ts` creates the empty assistant container first, then delegates one run to `application/conversation-generation.ts`.

The generation sequence is:

1. Convert the active container path to role-preserving AI SDK messages, excluding messages whose `ChatMessage.type` is `error`.
2. Resolve default Feature API grants and the active character package override, then use the built Capability objects as the minimal Sandbox base environment.
3. Ask `Plugin` to read scoped JSON container declarations from each enabled plugin's root `containers.json`, index file membership metadata, and discover root entry conventions without evaluating or flattening resources.
4. Add the active path, empty container, empty message, registered Skill/MCP tool names, and component-interaction API to the same minimal environment.
5. Read metadata-bound `.data` definitions, replay the functions bound to selected message versions, and expose a fresh read-only Data container. Then update hierarchical compression segments and replace eligible old `chat` ranges with the farthest valid memory pointers.
6. Collect exact `tools/<name>/tool.js + prompt.md` pairs. Resolve the prompt resources into one `# 自定义工具` system block and reserve `ctx.tools` for the source-scoped functions without adding model-visible AI SDK tools.
7. Compile the explicitly selected main plugin's root `context.md` with replayed `.data` instances. `:::pulsar role=...` fences preserve roles, `[[chat]]` splices the compressed frontier, and `<@...>` links only explicitly requested resources. The generated Feature API, Data-container, and custom-tool blocks remain prepended system messages. A missing entry document is an explicit configuration error.
8. Collect every enabled root `regex.json`, sort files by descending priority and stable plugin/resource IDs, then post-process the final message list by role and one-based depth from its end.
9. Compile custom functions into the authorized Sandbox, then preprocess and execute the selected `action/` JavaScript file or the same main plugin's non-empty root `agentprocess/index.js`. The process can call `api.runProcess(explicitResource, overrides?)`, authorized Feature APIs, `api.askUserWithComponent(...)`, or `api.renderComponent(componentId, props)`. Agent resources expose the constructor immediately and hydrate the model, the single CodeAct tool, and lifecycle hooks only through `agent.prepare()`; the built-in plugin visibly decides whether to construct `ToolLoopAgent`. A missing process is an explicit error rather than an invisible fallback.
10. Normalize the process result into the already-created assistant message and persist generation metadata, resolved resource IDs, and linker/regex/custom-tool/memory diagnostics.

Character packages persist an optional `capabilities` map. An omitted map inherits the default configuration; a package map overrides defaults feature by feature, and an explicit empty list denies that Feature.

Every conversation belongs to a user character package. `kind` is `chat`, `task`, or `test`; `binding` independently records the related package, resource type/id, concrete path, title, and optional plugin id. The workspace empty state does not persist a conversation until the first message is sent, and lets the user select an existing package or create one before choosing `chat` or `task`.

Right-sidebar tasks are `task` conversations in their real project package. The merged Task panel derives scope from the active workspace tab, filters by exact binding path, manages associated conversation files from its header, and embeds a compact scoped chat using the shared composer. Plugin workspaces publish `/plugins/<pluginId>/<selected path>` as their selected file changes; plugin bindings create `test` conversations. Deleting a project or plugin removes conversations bound to it.

The current `Conversation` record is available in the generation environment as `conversation`. During regeneration, the store searches backward from the selected assistant page for the most recent completed page. A page is complete when it has content and either no generation metadata or a finished `timeUsed` value. That page is exposed as `beforeGenerationMessage` and inserted as a system message asking the model to reduce unnecessary repetition; if no complete page exists, it is omitted.

Each conversation persists `reasoningEffort` as `none`, `low`, `medium`, `high`, or `xhigh`. The composer slider updates that field. Generation exposes it as the `reasoningEffort` Sandbox value and binds it to AI SDK 7's portable top-level `reasoning` option for the plugin-process-created `ToolLoopAgent`.

Each conversation also persists `featureApiEnabled`, defaulting to enabled and inherited by conversations cloned from a template. The composer `Feature API` test button toggles it. When disabled, generation skips both the authorized Capability runtime objects and the generated Feature API documentation block; Agent process control and ordinary conversation context remain available so the same conversation can compare model behavior with and without Feature APIs.

## Replayable variables and compression memory

Updater-enabled `.data` files define isolation, initial anemic state, facade wrapper, and model-facing description. Referencing resources persist only `{ alias, dataId }` metadata. A successful synchronous CodeAct call with `intent: "variable-update"` reads and writes through `data.readForResource(resourceId, dataId)` / `data.writeForResource(...)` and stores its deterministic function on the concrete assistant `ChatMessage.meta.variableUpdate`; multiple successful calls in the same generation are composed in original order. Each call executes against a cloned draft first; errors return to the model for repair, and three consecutive failures abort. The intent has no normal Sandbox APIs and denies external effects, detached async work, current time, and randomness.

At generation start, `application/conversation-memory.ts` replays only update-bearing selected messages in active-path order. Its bounded in-memory cache is keyed by definition hash and each parent/container/message-version/source-hash transition; it does not persist an object snapshot per message. A definition change or branch/version change naturally selects a different chain. Replay failure is fatal, preventing a silently inconsistent world state. The resulting anemic values are bound to each referencing resource before Markdown prompt compilation.

The same module owns derived compression segments in `resource_conversation_memory_segments`. Root `context.md` resource metadata may set a container threshold; zero disables the feature. Once two threshold windows exist, the newest window stays raw while old leaf ranges are summarized in groups with bounded concurrency. Ranges containing attachment/component/action parts remain raw until a lossless rich-part compression contract exists. Four adjacent same-level pointers can form a parent pointer. Every leaf records exact container and selected message-version IDs; parent validity recursively depends on its children. Reading greedily uses the farthest valid pointer and leaves uncovered ranges raw. Failures fall back to raw chat with diagnostics, and conversation deletion removes the segments.

While a conversation is generating, its workspace tab receives the generic UI `loading` status and renders a spinner even when another tab is active. The status is cleared in the generation `finally` path.

Generation components register through `presentation/generation-component-registry.ts`. A component emits `resolve` with its result or `cancel`; `GenerationComponentDialog.vue` keeps the generation promise pending while the user interacts with it. Components added with `api.renderComponent` are stored as message parts and rendered below the message markdown through the same registry.

## Message Types and Chat Presentation

Every persisted `ChatMessage` has a semantic `type`: ordinary content uses `message`, while failures use `error`. Existing records without the field are normalized to `message` when loaded. Generation failures set the current assistant message to `error`, and `conversation.pushErrorMessage(content)` lets authorized generated JavaScript append the same error message type explicitly.

Error messages stay visible in the conversation but are removed from the role-preserving `chat` messages, the `activePath` passed into the next generation environment, regeneration comparison input, and bound-conversation resource snapshots. This keeps operational failures from becoming model conversation content.

Each concrete message version can persist an optional `favorite` flag. The message overflow menu toggles it, the conversation-map search ranks matching favorites before other message previews, and the Conversation-owned favorite settings page can reopen the owning conversation, restore the selected message version and branch, and request a renderer jump to that container.

The standard renderer composes the shadcn-vue `MessageScroller`, `Message`, `Bubble`, `Marker`, and `Attachment` primitives. Its active path is virtualized with `@tanstack/vue-virtual`, dynamic `measureElement` sizing, six-row overscan, and logical item counts supplied to the shared scroller so streaming follow mode and jump-to-latest remain intact. Map and favorite navigation use virtual indexes before the target row mounts.

When the persisted Appearance setting `interactiveCodePreview` is enabled, `ConversationMessageContent.vue` splits fenced code blocks through the pure `domain/message-code-preview.ts` parser. Blocks containing `<html>`, `<!DOCTYPE>`, or `<script>` become sandboxed `srcdoc` iframes without `allow-same-origin`; the last active message replaces its normal body with the preview, while older messages render Markdown and previews in sequence. A source/preview toggle remains available. The setting defaults to disabled.

Translations persist the previous content in `ChatMessage.meta.translation`. The overflow action restores that original text and clears the snapshot; ordinary message editing also clears stale translation metadata. Error messages continue to render as destructive alert bubbles with a labeled marker. The conversation map uses an `InputGroup` search field; a non-empty query replaces the graph canvas with clickable previews for every matching message version.

Skill and MCP features register executable extensions through `Agent/application/agent-extension-registry.ts`. CodeAct exposes them as `agent.callExtension(...)`, `skills.call(...)`, and `mcp.call(...)` context functions rather than additional model tools or a second generation path.

Plugin custom tools follow the same one-tool rule. The model reads their generated documentation block and invokes `await ctx.tools[name](...args)` from inside CodeAct. Every documented entry includes source plugin identity plus function/prompt resource IDs and paths so follow-up inspection remains possible.

The Agent resource set exposes ask-user through `agent.askUser(...)` and `api.askUser(...)` inside CodeAct. Its Zod input contains one question and 1-8 predefined options. Conversation generation opens the registered `agent.ask-user` generation component and waits for either a predefined option or the final free-response dialog. The selected value becomes the CodeAct function result, so the model can continue from the user's answer without a second model tool.

## Conversation Renderers

Each conversation persists a `rendererId`. The right-sidebar conversation menu switches between the standard chat renderer and `NovelConversationRenderer.vue`.

The novel renderer treats every assistant container on the active path as a chapter. It provides previous/next controls and a chapter selector, keeps the closest preceding user container as a collapsed prompt, and centers the reading surface with mobile-specific spacing and typography. Generation components attached to the active assistant message continue to render inside the chapter.

A conversation marked as the package template stores the same `rendererId`. `createConversation` copies that renderer while cloning the template's message path, so new conversations inherit the chosen reading mode without a separate package-level setting.

## Composer Actions

Typing `/` at the beginning of the composer opens enabled Plugin JavaScript and Markdown commands. JavaScript selection keeps the existing one-leading-`ActionPart` behavior. Markdown selection copies the file body into the composer without sending; direct `/name` submission performs the same fill operation and preserves pending attachments.

`conversation-store.ts` resolves the action only from the latest user container and passes its identity plus the prompt to `runConversationGeneration`. The minimal environment exposes the command as `action` and the remaining user text as `prompt`. The selected conventional `action/` file supplies the temporary process source for that generation only.

Standard, novel, and task-panel conversation views reuse the active package's ordered root regex rules. They apply only rules with `applyOnRending: true` to display copies, so editing, copying, translation, and persistence continue to use original message content.

## Composer Toolbar

The footer tool buttons are rendered from the appearance store's `composerToolbar` layout. `left` and `right` control visible order; `unused` hides tools. The appearance settings page uses the same catalog in a non-interactive composer-shaped drag editor, including pointer dragging for mobile. The `reasoning` tool opens a shadcn-vue `Popover` containing a five-step `Slider`; the `feature-api` tool shows the current injection state and toggles it for the active conversation. Old toolbar snapshots receive missing tools through normal layout normalization.

The `map` tool opens `ConversationBranchMapDialog.vue`. It builds a non-merging graph directly from the current conversation's `ChatMessageContainer.previousContainer` relationships, while `availableNextContainer` supplies stable sibling ordering. Every container remains an independent node, and the current active path is highlighted. Its search input covers every message version in the active conversation; while a query is present, favorite-first preview results replace the graph canvas.

Selecting a map node or search result updates every ancestor's `activeNextContainer`, follows the selected node's preserved active descendants to establish the conversation tail, and then scrolls the standard `MessageScroller` to the selected container. Search and favorite-page results also activate their exact message version first. The novel renderer selects the matching or next assistant chapter. Existing appearance snapshots receive `map` in the default right-side toolbar through normal layout normalization.

## File Attachments

Conversation file attachments follow the AI SDK `ModelMessage` file-part format documented at `https://ai-sdk.dev/docs/reference/ai-sdk-core/model-message`. Files are stored on `ChatMessage.parts` with `type: "file"`, raw base64 `data`, an IANA `mediaType`, optional `filename`, and local display `size`.

`application/message-attachment.ts` converts browser files into serializable parts and reconstructs object URLs for preview or download. `conversation-store.ts` converts a user message with attachments into AI SDK array content:

- optional `{ type: "text", text }`;
- one `{ type: "file", data, mediaType, filename }` entry per attachment.

The composer keeps unsent attachments above the editor as a horizontal attachment group. Existing user messages expose the same attachment strip plus add/remove controls; changes persist with the message container and participate in later generation paths.
