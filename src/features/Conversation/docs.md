# Conversation and World replay

Conversation persists chats, message containers and concrete message versions.
It does not own a second resource tree. A message version optionally contains
an ordered `meta.pulses` array.

Chats have a `lifetime`: ordinary chats are `persistent`; `app` chats persist
while the process is alive so renderer reloads can recover them, then the main
window's startup path removes leftovers through `deleteChatCascade`. Child
windows, tray hiding, and page changes never perform that cleanup.

Concrete message versions may also contain ordered `meta.intervalOperations`.
`evaluateIntervals(activePath)` is a pure reducer: it sees only each
container's selected version on the active branch, yields open intervals,
closed spans, and diagnostics, and stores no derived span. `autoEndAfter: N`
closes after the Nth later visible (non-system) container is reduced; system
Pulse containers do not advance that counter. Consumers such as context or
memory compression read this projection and never rewrite its operations.

When `useWorld({ conversationId, applyReplay: true })` is read, it clones the
package's stored `/self` document and the shared `/global` document, then applies
the updates from the active container path in order. Switching a branch or a
message version therefore changes the World naturally, with no overlay store or
snapshot cache.

Edits made from the asset panel create a hidden system message containing those
updates. Generation binds its own assistant message version and appends updates
there. The replay executor writes neither the base World nor the database.

The composer, generator and Sandbox receive a World-scoped API. Reads are from
the replayed tree; writes use the same update contract, so a generation sees its
own prior edits immediately. `applyReplay: false` is reserved for editing the
original package or shared source documents.
