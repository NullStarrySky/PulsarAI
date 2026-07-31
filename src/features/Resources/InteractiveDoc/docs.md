# Interactive Document Resources

Interactive documents are UTF-8 SFC-like source files. Persisted `.imd` content remains readable and diffable while the domain compiler produces role-preserving AI SDK messages plus a Markdown diagnostic view.

## Source format

One document may contain multiple prompt templates:

```html
<prompt_template name="identity" role="system">
# {{ <@local:profile>.name }}

<@path:./rules.md>
</prompt_template>
```

`role` is `system`, `user`, or `assistant`. Templates retain normal Markdown, `{{...}}` expressions, `[[...]]` message splices, and explicit Plugin references.

Local values live under one data block:

```html
<data>
  <sub_data name="profile">
    <enable_updater>
      true
    </enable_updater>
    <description>
      Character profile used by the identity template.
    </description>
    <content type="json">
      { "name": "Alice" }
    </content>
    <wrapper>
      function (value, variable) {
        return {
          get name() { return variable.value.name; },
          rename(name) { variable.value.name = String(name); return variable.value.name; },
          replace(next) { variable.replace(next); return variable.value; },
        };
      }
    </wrapper>
  </sub_data>
</data>

<memory>
  <compression_threshold>24</compression_threshold>
</memory>
```

`content` supports `json` or raw `value`. When `enable_updater` is true, it is the initial anemic state for a replayable variable. `description` is automatically collected into the `# 变量说明` system context, so it should document the facade methods and invariants the model is allowed to use.

`wrapper` is an optional sandboxed `function (value, variable) { return facade; }`. Object and array methods may mutate the cloned `value` draft. Primitive or whole-value replacement uses `variable.replace(nextValue)` and reads the replacement through `variable.value`. During normal prompt compilation the facade is read-only; during a `variable-update` intent it receives a transactional clone. A failed function is discarded in full.

`memory.compression_threshold` controls compression memory by message-container count. Omission or `0` disables compression; positive values are normalized to a minimum of four.

## Compilation

`domain/interactive-document.ts` owns:

- parsing and normalized serialization;
- legacy block-JSON conversion;
- local JSON/value construction;
- variable-definition, wrapper-facade, and description-context construction;
- optional data overrides from the active conversation variable state;
- compression-memory threshold parsing;
- explicit reference preprocessing;
- guarded `ref` access;
- Sandbox macro and message-splice expansion;
- role-preserving messages, Markdown output, dependency inventory, and diagnostics.

Local data is never injected under a bare name. It is available only through `<@local:name>`. External resolution is provided by the Plugin reference resolver, so the InteractiveDoc domain does not inspect plugin trees. `<@容器名称>` resolves a uniquely visible container; scoped container, path, and ID forms remain available when the target must be explicit.

## Conversation variable updates

At generation start, Conversation evaluates enabled variables from their IMD initial values and replays the update function bound to each selected message version on the active path. The cache key includes the definition revision, parent state key, container ID, selected message version ID, and function source hash. Cached states are bounded in-memory checkpoints, not snapshots persisted on every message.

The model requests an update through the only model-visible tool:

```js
// codeAct intent: variable-update
function () {
  variables.profile.rename("Alicia");
  return variables.profile.name;
}
```

This intent receives only the variable facades. Network, files, Plugin/Feature APIs, real current time, randomness, detached async work, and other external side effects are unavailable. Execution errors are returned to the ToolLoopAgent for correction; a third consecutive failed variable update throws. Successful calls in one generation are composed in original order and stored at `ChatMessage.meta.variableUpdate` for the current assistant message version. Historical replay failure stops generation instead of silently accepting a partial state.

Each generation recompiles the IMD with the latest replayed anemic values, so `<@local:...>` resolves through fresh read-only wrappers. Switching a message version or branch selects a different update chain without rewriting descendants.

## Compression memory

When the active path contains at least two threshold-sized windows, Conversation keeps the newest threshold containers raw and sends older fixed-size ranges to the configured fast model. Leaf summaries are generated with bounded parallelism and stored as immutable conversation-memory segments containing exact container and message-version IDs.

Four adjacent segments at the same level can be summarized again into a parent segment. Parents point to child segment IDs, so compression can form multiple levels without changing message content or container topology. On read, the resolver validates all descendant pointers against the active path and chooses the farthest valid segment at each position; uncovered and recent ranges remain raw messages. A changed version invalidates affected pointers by identity/hash. Compression failure falls back to raw messages and emits a diagnostic. Deleting a conversation deletes its derived segments as well.

## Workspace

`presentation/InteractiveDocumentWorkspacePage.vue` has three views:

- Edit presents each `prompt_template` in Milkdown with `<@...>` syntax highlighting, each `sub_data` with updater/description/content/wrapper fields, and the compression threshold. Typing `<@` opens reference completion for local data and currently visible Plugin containers; suggestions show their optional descriptions and insert a scoped container target when a short name would be ambiguous.
- Source edits the complete SFC text. Container declarations and namespaced container references belong to the owning plugin root `containers.xml`; resource memberships are Plugin file metadata and never appear in IMD source.
- Preview compiles the current source and renders each output message with its role and any parser/linker diagnostics.

The layout becomes a single-column data grid below 768px and keeps usable touch targets.

The workspace is registered for `resourceType: "interactive-doc"` and is reused by Plugin `.imd` files.
