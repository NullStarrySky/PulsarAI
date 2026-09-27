# World resources

World is the resource model. A role owns one local source document at
`resource_worlds:local:<localPluginId>`. Global Plugins are independent source
trees identified at runtime by their source folder names. The role's root
`definition.package.json` stores the enabled folders as `globalPlugins: string[]`;
the array is both the enable set and merge order.

Every document is a name-keyed folder tree whose files contain authored strings.
Paths are the sole resource addresses. File metadata (slot, selection, priority,
and conditions) is stored in a source-local path map. The local source's
`global.slot.json` defines the shared slots; each source's `local.slot.json`
declares its contributions.

`usePluginData()` replays every available source independently, then mounts all
global folders, including inactive sources. `useActivePluginData(filetree)`
filters the runtime projection in the role definition's enabled-source order.
Neither projection is persisted.

## Updates and replay

File API operations are synchronous transient commands (`Pulse`), not a stored
action log. Each message version owns `meta.recal = { self, global }`, where
`global` is keyed by source folder name. Each source delta is a map from final
source-local absolute paths to delete, file, or folder entries. Missing paths
inherit the baseline; explicit children override inherited folder contents.
Record enumeration order does not affect replay.

A file entry stores `from`, `edit`, and `meta_edit`; a folder stores `from`.
`from` always reads the immutable baseline, including during swaps and deletes.
`null` means a newly created file/empty directory; in-place modifications use
an explicit original path. Moving adds a deletion at the old position; copying
retains it. A moved folder inherits its whole original subtree, with explicit
child changes only where needed. Copying a modified subtree preserves its
content and metadata at copy time, independently of subsequent source edits.

The builder first applies the operation to an isolated in-memory tree, tracks
original provenance, then derives its final delta. Text changes are plain
serializable diff-match-patch tuples against that fixed original content;
unchanged text has `edit: null`. Equal text is retained in the tuples so replay
can validate the entire old content exactly, rather than fuzzily applying a
patch. This favors exactness over minimal serialized text size. Metadata uses
`set` and `unset`. Empty net changes are omitted. There is no action compactor.
Failed operations do not publish a delta.

The on-disk `PluginDocument { id, tree, meta, versions }` retains its original
source. Each saved version owns a cumulative `recal` against that original,
plus a history-only `parentId`. A head stays mutable until a conversation pins
its ID, after which editing forks a new saved version. Conversation replay
starts from its pinned Plugin version. Each message version's delta is relative
to the preceding selected message path, never its sibling alternative or its
last editing operation. Message groups replay sequentially. A changed text
baseline is reported as a conflict rather than silently rebasing that edit.

Moves and copies cannot cross source roots. Disabling a global source affects
runtime selection, not its replay. If a source is unavailable, its delta remains
stored but is skipped, so other sources still replay. This does not reconstruct
a deleted source or retain its original content; replaying it later requires a
compatible baseline. A source folder name alone is not a version snapshot.

## Paths and source scope

`/...` addresses the role's local source. `/global/<source-folder>/...`
addresses one global source. In authored resources `@/...` resolves to the
resource's own source root. There is no `@pluginId/...` syntax.

## User interface

`PluginAssetTreePanel` renders the same World through the shared generic file
tree:

- Assets: physical local and `/global` trees, including the slot JSON files.
- Slots: global slot definitions with their contributed resources, independent
  of source.
- Sources: source folder → declared logical slots → resource.

Only Slots and Sources resource rows receive a selection switch and its hover
icon treatment; Assets stays a pure filesystem view. Slot icons override the
normal file icon in the slot projection, and source labels precede resource
names.

## Mode resources and reference estimates

The built-in `MODE` slot accepts JSON resources with `id`, `name`, optional
`description`, and optional `enter`/`exit` resource paths. Paths are absolute
World paths. Switching imports the previous mode's exit script before the new
mode's enter script; Conversation continues to own the interval marker.

The file editor estimates text-like resource size locally with tiktoken's
`cl100k_base` encoding. The number is informational: recursive imports,
conditions, slots and runtime macro expansion may change the actual prompt cost.

## Media resources

Non-text World resources retain a `media://<uuid>` link while their bytes stay
in the host media container. `useWorld.remove` remains an ordinary World-file
operation and intentionally does not delete that host file. Agent code receives
`generateImageToPath(options)` alongside its existing Image Generation options:
it writes the first generated image to `options.path` (or `temp` by default) and
returns `Promise<string>` with the media ID. Use `media.link(id)` directly in
Markdown, for example `![generated image](media://<uuid>)`; the conversation
renderer resolves that link through the host media container. It also works as
the `src` of an HTML media tag.

## JavaScript modules and persistent state

JS resources declare `export default`; `imports(path)` / `fs.import(path)` synchronously return that value without invoking it. Use `read(path)` for source text. Module loading supports default exports only; use `imports` rather than static imports, and place asynchronous work inside exported async functions.

Each generation owns an `importRegistry` keyed by resolved absolute resource paths. Repeated imports return the same value, preserving module closures; a new generation gets a new registry. Calling a composable repeatedly can still create separate instances, so a module may retain a shared instance when needed. Source-local references remain bound to the defining resource.

Persist state in ordinary JSON and expose actions or derived values through JS composables. Actions use `JSON.parse(read(path))` for the latest state and `write` / `edit` to append version-owned Pulse. Imported JSON remains a snapshot for the generation even after file writes. Describe callable resource paths in ordinary context resources; no automatic state injection is required.
