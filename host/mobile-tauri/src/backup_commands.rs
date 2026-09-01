use super::*;
use crate::backup::*;

fn apply_pending_restore(app: &AppHandle) -> Result<(), String> {
    let marker = restore_marker_path(app)?;
    if !marker.exists() {
        return Ok(());
    }

    let pending: PendingRestore =
        serde_json::from_slice(&fs::read(&marker).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    let backup_path = PathBuf::from(pending.backup_path);
    let manifest = read_backup_manifest(&backup_path)?;
    let materialized = if manifest.version >= 2 {
        let target =
            app_data_dir(app)?.join(format!("restore-materialized-{}", timestamp_millis(),));
        materialize_manifest_files(
            backup_path
                .parent()
                .ok_or_else(|| "备份目录无效".to_string())?,
            &manifest,
            &target,
            None,
        )?;
        Some(target)
    } else {
        None
    };
    let source_root = materialized.as_deref().unwrap_or(&backup_path);
    let source = source_root.join("surrealdb");
    let target = db_dir(app)?;
    let old_target =
        app_data_dir(app)?.join(format!("surrealdb-before-restore-{}", timestamp_millis()));

    if target.exists() {
        fs::rename(&target, &old_target).map_err(|error| error.to_string())?;
    }
    copy_dir_recursive(&source, &target)?;
    let resource_source = source_root.join("resources");
    if resource_source.exists() {
        copy_dir_recursive(&resource_source, &app_data_dir(app)?.join("resources"))?;
    }
    if let Some(path) = materialized {
        let _ = fs::remove_dir_all(path);
    }
    let _ = fs::remove_file(marker);
    Ok(())
}

#[tauri::command]
pub(crate) async fn backup_list(
    app: AppHandle,
    directory: String,
) -> Result<Vec<BackupInfo>, String> {
    let dir = backup_dir(&app, directory)?;
    let mut backups = Vec::new();

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() && path.join("manifest.json").exists() {
            backups.push(backup_info(&path)?);
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

pub(crate) async fn backup_create(
    app: AppHandle,
    state: State<'_, AppState>,
    directory: String,
    max_backups: String,
) -> Result<BackupInfo, String> {
    let _ = app_db(&app, &state).await?;
    let created_at = timestamp_millis().to_string();
    let dir = backup_dir(&app, directory.clone())?;
    let path = dir.join(format!("pulsarai-db-backup-{created_at}"));
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    let resources = app_data_dir(&app)?.join("resources");
    let manifest = create_incremental_manifest(
        &dir,
        created_at,
        &[("surrealdb", db_dir(&app)?), ("resources", resources)],
    )?;
    fs::write(
        path.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    prune_backups(&app, directory, max_backups)?;
    garbage_collect_backup_objects(&dir)?;
    backup_info(&path)
}

pub(crate) fn prune_backups(
    app: &AppHandle,
    directory: String,
    max_backups: String,
) -> Result<(), String> {
    if max_backups == "unlimited" {
        return Ok(());
    }

    let limit = max_backups.parse::<usize>().unwrap_or(10);
    let mut backups = backup_list_sync(app, directory.clone())?;
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for backup in backups.into_iter().skip(limit) {
        let _ = fs::remove_dir_all(backup.path);
    }
    garbage_collect_backup_objects(&backup_dir(app, directory)?)?;
    Ok(())
}

pub(crate) fn backup_list_sync(
    app: &AppHandle,
    directory: String,
) -> Result<Vec<BackupInfo>, String> {
    let dir = backup_dir(app, directory)?;
    let mut backups = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.is_dir() && path.join("manifest.json").exists() {
            backups.push(backup_info(&path)?);
        }
    }
    Ok(backups)
}

#[tauri::command]
pub(crate) async fn backup_restore(
    app: AppHandle,
    _state: State<'_, AppState>,
    directory: String,
    backup_id: String,
) -> Result<(), String> {
    let dir = backup_dir(&app, directory)?;
    let path = dir.join(backup_id);
    let manifest = read_backup_manifest(&path)?;
    if manifest.version < 2 && !path.join("surrealdb").exists() {
        return Err("备份目录中没有 surrealdb 数据。".to_string());
    }
    fs::write(
        restore_marker_path(&app)?,
        serde_json::to_vec_pretty(&PendingRestore {
            backup_path: path.to_string_lossy().to_string(),
        })
        .map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn backup_read_resources(
    app: AppHandle,
    directory: String,
    backup_id: String,
) -> Result<BackupResourceSnapshot, String> {
    let root = backup_dir(&app, directory)?;
    let backup_path = root.join(backup_id);
    let manifest = read_backup_manifest(&backup_path)?;
    let materialized = if manifest.version >= 2 {
        let target = app_data_dir(&app)?.join(format!("backup-read-{}", uuid::Uuid::new_v4(),));
        materialize_manifest_files(&root, &manifest, &target, Some("surrealdb"))?;
        Some(target)
    } else {
        None
    };
    let path = materialized
        .as_deref()
        .unwrap_or(&backup_path)
        .join("surrealdb");
    if !path.exists() {
        return Err("备份目录中没有 surrealdb 数据。".to_string());
    }
    let db = open_database(&path).await?;
    let snapshot = BackupResourceSnapshot {
        packages: select_database_values(&db, "resource_packages").await?,
        conversations: select_database_values(&db, "resource_conversations").await?,
        containers: select_database_values(&db, "resource_message_containers").await?,
        worlds: select_database_values(&db, "resource_worlds").await?,
    };
    drop(db);
    if let Some(path) = materialized {
        let _ = fs::remove_dir_all(path);
    }
    Ok(snapshot)
}

#[tauri::command]
pub(crate) async fn backup_restore_resource_files(
    app: AppHandle,
    directory: String,
    backup_id: String,
) -> Result<(), String> {
    let root = backup_dir(&app, directory)?;
    let backup_path = root.join(backup_id);
    let manifest = read_backup_manifest(&backup_path)?;
    if manifest.version >= 2 {
        materialize_manifest_files(&root, &manifest, &app_data_dir(&app)?, Some("resources"))?;
    } else {
        let source = backup_path.join("resources");
        if source.exists() {
            copy_dir_recursive(&source, &app_data_dir(&app)?.join("resources"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn backup_delete(
    app: AppHandle,
    directory: String,
    backup_id: String,
) -> Result<(), String> {
    let dir = backup_dir(&app, directory)?;
    let path = dir.join(backup_id);
    fs::remove_dir_all(path).map_err(|error| error.to_string())?;
    garbage_collect_backup_objects(&dir)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn resource_archive_write(
    app: AppHandle,
    path: String,
    payload: ResourceArchivePayload,
) -> Result<(), String> {
    write_resource_archive_file(
        Path::new(&path),
        &payload,
        &app_data_dir(&app)?.join("resources"),
    )
}
pub(crate) async fn resource_archive_read(
    app: AppHandle,
    path: String,
) -> Result<ResourceArchivePayload, String> {
    read_resource_archive_file(Path::new(&path), &app_data_dir(&app)?.join("resources"))
}

#[tauri::command]
pub(crate) async fn resource_archive_restore_files(
    app: AppHandle,
    path: String,
    overwrite: bool,
) -> Result<(), String> {
    restore_resource_archive_files(
        Path::new(&path),
        &app_data_dir(&app)?.join("resources"),
        overwrite,
    )
}
