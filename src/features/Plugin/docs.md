# World resources

World is the resource model. It has two persisted documents with the exact same
nested node shape:

- `resource_worlds:global` is the shared document.
- `resource_worlds:local:<localPluginId>` is a local Plugin's World document.
  document. Its root contains global `/self/slot/` contracts and a source-local
  `/self/localSlot/` definition tree.

Every document is a folder tree. Folder and file keys are stable node IDs;
`name` is only display text and ordinary sibling files/folders may share it. A
name path is a convenience lookup and must resolve exactly one node; use
`/self/$<id>` or `/global/$<source-id>/$<id>` when a stable reference is
needed. A file owns its content, slot reference, selection
state, priority and optional condition. Folders directly below `/self/slot/`
are global slot contracts. Every source root (`/self/` and each
`/global/<source>/`) owns a `localSlot/` tree; its descendant folders define
local slots and may point at a global contract through their stable `parent`
path. A file stores its local-slot ID path in `slot`, so renaming either folder
does not invalidate membership.

`useWorld(options)` is the only World API. With `applyReplay: false` it reads
and edits the stored global/self documents. With a conversation and replay
enabled, it clones those documents and applies the active message path's ordered
`pulses`. Slot and source views are projections exported by the same
composable; they are not stored separately.

## Updates and replay

Business calls (`write`, `edit`, `mkdir`, `move`, `copy`, `remove`,
`updateFile`) first translates input into one logical `Pulse`. Each Pulse
stores a target node ID plus a short local path. It either writes a value,
removes a value with `none`, replaces a unique substring, copies from an ID
reference with a deterministic ID map, or moves an ID reference. Persistent
edits batch the affected document's JSON patches before applying the same result
to memory. Move and copy reject a destination below the source folder; move
keeps IDs while copy regenerates every copied subtree ID.

Conversation edits append the same update items to a hidden system message, or
to the current message version during generation. Replay only applies those
items to a cloned World; it never writes the database.
If the active tail is already a pure Pulse-only system container, later edits
reuse that container instead of extending the conversation path.

Node timestamps are not replay data and do not participate in sync. A persisted
World document is versioned by Database sync metadata's per-device vector;
within one message container, later direct file-content or metadata-property
writes replace the earlier write to that same node/property. Structural
operations and writes in different containers retain their order.

## Paths and source scope

`/self/...` addresses the package document. `/global/...` addresses the shared
document. In authored resources `@/...` resolves to the resource's own source
root; shared built-ins use their top-level global folder as that root. There is
no `@pluginId/...` syntax and no runtime Plugin object.

## User interface

`PluginAssetTreePanel` renders the same World through the shared generic file
tree:

- Assets: physical `/global` and `/self` trees, including each `localSlot/`.
- Slots: global contracts with their contributed resources, independent of
  source.
- Sources: source folder → `slot` (the source's global-slot contributions)
  and `localSlot` (its local definitions) → local slot → resource.

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
returns `Promise<string>` with the media ID. Use `media.link(id)` to emit the
stored result in Markdown or an HTML media tag.
