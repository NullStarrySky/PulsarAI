# Conversation and World replay

Conversation persists chats, message containers and concrete message versions.
It does not own a second resource tree. A message version optionally contains
an ordered `meta.worldUpdates` array.

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
