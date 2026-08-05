# Context Markdown and Data Resources

Pulsar context documents are ordinary UTF-8 Markdown. Data definitions never live inside Markdown.

## Role-aware Markdown

Text outside a role fence compiles as `system`. Use an explicit, non-nesting fence when a document needs another role:

```md
:::pulsar role=system
System instructions.
:::

:::pulsar role=user
Few-shot user input.
:::

:::pulsar role=assistant
Few-shot assistant output.
:::
```

The parser ignores Pulsar markers inside normal backtick or tilde code fences. Malformed, nested, orphaned, or unclosed role fences produce structured diagnostics. Markdown still supports Sandbox `{{...}}`, role-preserving `[[...]]`, and the source-scoped `imports` API inside macros.

The root context entry is the exact Plugin path `context.md`. Its compression-memory threshold is resource metadata, not Markdown content.

Leading YAML frontmatter delimited by `---` is recognized by the shared Milkdown feature, retained as an atomic node for Markdown serialization, and omitted from rendered content. Metadata is therefore not misread as thematic breaks or Setext headings. Plugin Markdown can switch to its raw source editor when the frontmatter itself needs to be changed.

## `.data` definitions

A `.data` file is JSON that defines reusable state rather than storing a Conversation's current value:

```json
{
  "version": 1,
  "isolation": "resource",
  "description": "Character health and its invariants.",
  "initialValue": { "hp": 100, "maxHp": 100 },
  "enableUpdater": true,
  "wrapperSource": ""
}
```

`isolation` is owned by the `.data` definition:

- `resource` creates one Conversation state instance for each referencing resource ID.
- `conversation` shares one instance among all referencing resources in the same Conversation.

Runtime values remain replayable Conversation state bound to concrete message versions. `.data` files are never rewritten when values change and no data instance is shared across Conversations.

## Data imports

Import Data by literal relative path or stable ID:

```md
{{ imports.resource("./state.data").hp }}
{{ imports.resourceById("stable-data-id").inventory }}
```

The returned value is the hydrated wrapper facade, not raw JSON text. Static discovery prepares the definition before replay; runtime resolution derives its state identity from the Data ID, isolation, and importing resource/conversation. Moving a path-imported Data file requires updating that literal, while ID imports remain stable.

## Data container API

Ordinary CodeAct context receives a read-only Conversation data container:

```js
function () {
  return data.readForResource(resourceId, dataId);
}
```

The synchronous `variable-update` intent receives the transactional form:

```js
function () {
  const value = data.readForResource(resourceId, dataId);
  value.hp = Math.max(0, value.hp - 10);
  return data.writeForResource(resourceId, dataId, value);
}
```

It cannot use Feature or Plugin APIs, files, network, current time, randomness, detached async work, or other effects. A failed update discards the whole draft; successful functions are stored in order on `ChatMessage.meta.variableUpdate` and replayed only along the active message-version path.

`listForResource(resourceId)` returns Data IDs, paths, isolation, writability, and values so an agent can continue querying with stable identities.

## Compilation and editing

`domain/interactive-document.ts` parses role-aware Markdown, evaluates Sandbox expressions with the source-scoped `imports` facade, and returns role-preserving model messages plus import dependencies and diagnostics.

Ordinary `.md` files use the Milkdown editing surface directly. They do not expose a redundant raw-source/preview switch. Raw-source switching is reserved for Vue files and convention JSON files that have a structured renderer, such as root `regex.json`.
