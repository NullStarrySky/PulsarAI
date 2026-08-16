# Version Management

`src/features/Backup` owns local history backups, selective resource restore, WebDAV configuration, and peer-to-peer LAN synchronization.

## Local history

New backups use a version 2 content-addressed repository. Each SurrealKV or
resource file is identified by SHA-256 and stored once under
`.pulsarai-objects/<hash>.zst` with Zstandard level 3 compression. A snapshot
directory contains only its manifest, so a later snapshot adds objects only for
files whose content changed. Pruning a snapshot runs object garbage collection
after all remaining manifests have been scanned.

Version 1 directory-copy backups remain readable and restorable. Full restore
remains a disaster-recovery operation: it writes a pending marker and replaces
the database on the next launch. Version 2 snapshots are materialized from
their object manifest before the existing replacement flow runs.

Selective restore opens the chosen backup as a read-only database and exposes these resource groups:

- character packages;
- conversations and their message containers;
- non-built-in plugins.

Selective restore never overwrites an existing resource. When an ID already exists, a new UUID and a `（从备份恢复）` name are generated. Restoring a conversation or package-local plugin requires its package to exist locally or be selected in the same restore operation. Conversation container IDs and links are remapped together.

Backups also retain the application resource directory. Selective restore copies missing media files back without deleting current files.

## Portable resource archives

Character packages, conversations, and non-built-in plugins can be exported as
`.pulsar-resource.zst` archives:

- a package includes its conversations, message containers, and package-local
  plugins;
- a conversation includes its owning package reference and message containers;
- a package-local plugin includes its owning package reference;
- referenced local files are rewritten to portable resource URIs and carried
  in the compressed archive; unrelated files in the resource directory are not
  included.

Import offers two explicit modes. Copy mode keeps the historical restore
behavior: colliding package, conversation, container, and plugin IDs are
remapped together and the imported root is renamed. Update mode preserves
stable IDs and performs a structural diff before persistence. Package relation
arrays are unioned by ID, conversation containers preserve both changed
message versions, branch links are unioned, and conflicting plugin files are
kept as renamed copies. Reapplying the same archive recognizes conflict copies
that were already preserved instead of duplicating them again. Scalar resource
metadata follows the imported update. The completion status reports how many
differing paths were resolved.

## LAN synchronization

Each installation owns a persistent device ID. Resource writes update a per-entity version vector in the database mirror metadata. Peers exchange filtered snapshots through the native LAN listener:

- `GET /snapshot` reads the published snapshot;
- `POST /snapshot` queues a merged snapshot for the receiving frontend;
- `x-pulsar-pairing-key` authenticates both operations.

Packages with `syncEnabled: false`, their conversations, message containers, and local plugins are excluded. Built-in plugins are never synchronized.

Merge policy:

- causally newer entities replace older entities;
- missing entities are copied;
- explicit newer tombstones delete matching entities;
- concurrent delete and edit keeps the edited entity;
- conversation containers union branches and message versions;
- concurrent edits to the same message keep both versions;
- plugin containers and resources merge by stable ID;
- concurrent edits to the same plugin resource create a renamed conflict copy.

The peer history map records the last successful merge time for each device ID. Secrets, model credentials, local file paths, and shell state are outside this synchronization surface.

## Ownership

- UI and orchestration: `backup-store.ts`
- resource selection: `BackupResourceRestoreDialog.vue`
- settings surface: `BackupSettingsPage.vue`
- version metadata: `src/features/Database/sync-metadata.ts`
- backup and LAN transport commands: `src-tauri/src/lib.rs`
