# World resources

World is the resource model. It has two persisted documents with the exact same
nested node shape:

- `resource_worlds:global` is the shared document.
- `resource_worlds:package:<packageId>` is the character package's local
  document. Its root contains the `/self/slot/` contract-folder tree.

Every document is a folder tree. Folder and file keys are stable node IDs;
`name` is only display text. A file owns its content, slot reference, selection
state, priority and optional condition. Slots are not folders and never own
resources. Empty folders below `/self/slot/` define the contracts, while a file
contributes by storing that folder's absolute path in its `slot` field.

`useWorld(options)` is the only World API. With `applyReplay: false` it reads
and edits the stored global/self documents. With a conversation and replay
enabled, it clones those documents and applies the active message path's ordered
`worldUpdates`. Slot and source views are projections exported by the same
composable; they are not stored separately.

## Updates and replay

Business calls (`write`, `edit`, `mkdir`, `move`, `remove`, `updateFile`) first
translate their input into `WorldUpdate` items. An update either writes a value,
removes a value with `none`, or replaces a unique substring. Persistent edits
patch SurrealDB first and apply that exact update to the in-memory document only
afterwards. A move is simply remove plus write with the same node ID.

Conversation edits append the same update items to a hidden system message, or
to the current message version during generation. Replay only applies those
items to a cloned World; it never writes the database.

## Paths and source scope

`/self/...` addresses the package document. `/global/...` addresses the shared
document. In authored resources `@/...` resolves to the resource's own source
root; shared built-ins use their top-level global folder as that root. There is
no `@pluginId/...` syntax and no runtime Plugin object.

## User interface

`PluginAssetTreePanel` renders the same World through the shared generic file
tree:

- Assets: physical `/global` and `/self` trees.
- Slots: contracts with their contributed resources, independent of source.
- Sources: source folder → slot → resource, without metadata files or an
  exported-slot layer.

Only resource rows receive a selection switch. Folder and slot rows do not have
selection semantics. Slot icons override the normal file icon in the slot and
source projections, and source labels precede resource names.
