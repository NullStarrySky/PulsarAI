# Version Management

`src/features/Backup` owns local history backups, selective resource restore, WebDAV configuration, and peer-to-peer LAN synchronization.

## Local history

Tauri stores each full database backup as a SurrealKV directory with a manifest. Full restore remains a disaster-recovery operation: it writes a pending marker and replaces the database on the next launch.

Selective restore opens the chosen backup as a read-only database and exposes these resource groups:

- character packages;
- conversations and their message containers;
- non-built-in plugins.

Selective restore never overwrites an existing resource. When an ID already exists, a new UUID and a `（从备份恢复）` name are generated. Restoring a conversation or package-local plugin requires its package to exist locally or be selected in the same restore operation. Conversation container IDs and links are remapped together.

Backups also retain the application resource directory. Selective restore copies missing media files back without deleting current files.

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

- UI and orchestration: `application/backup-store.ts`
- resource selection: `presentation/BackupResourceRestoreDialog.vue`
- settings surface: `presentation/BackupSettingsPage.vue`
- version metadata: `src/features/Database/application/sync-metadata.ts`
- backup and LAN transport commands: `src-tauri/src/lib.rs`
