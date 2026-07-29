use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    str::FromStr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use surrealdb::{engine::local::{Db, SurrealKv}, Surreal};
use tauri::{AppHandle, Manager, State};
use tokio::sync::OnceCell;

struct AppState {
    db: OnceCell<Surreal<Db>>,
    http: reqwest::Client,
    lan_sync: LanSyncState,
}

#[derive(Default)]
struct LanSyncState {
    server: Mutex<Option<LanSyncServer>>,
    snapshot: Arc<Mutex<serde_json::Value>>,
    pending: Arc<Mutex<Vec<serde_json::Value>>>,
}

struct LanSyncServer {
    port: u16,
    stop: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}

#[derive(Debug, Deserialize, Serialize)]
struct SecretRecord {
    name: String,
    value: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct ConfigRecord {
    key: String,
    value: serde_json::Value,
}

#[derive(Debug, Deserialize, Serialize)]
struct DatabaseRecord {
    #[serde(rename(deserialize = "resource_key", serialize = "id"))]
    id: String,
    value: serde_json::Value,
}

#[derive(Debug, Deserialize, Serialize)]
struct ProxyHeader {
    name: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct ProxyFetchRequest {
    url: String,
    method: String,
    headers: Vec<ProxyHeader>,
    body: Option<Vec<u8>>,
}

#[derive(Debug, Serialize)]
struct ProxyFetchResponse {
    status: u16,
    headers: Vec<ProxyHeader>,
    body: Vec<u8>,
}

#[derive(Debug, Serialize)]
struct BackupInfo {
    id: String,
    name: String,
    path: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct BackupManifest {
    version: u8,
    created_at: String,
    kind: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct PendingRestore {
    backup_path: String,
}

#[derive(Debug, Serialize)]
struct BackupResourceSnapshot {
    packages: Vec<serde_json::Value>,
    conversations: Vec<serde_json::Value>,
    containers: Vec<serde_json::Value>,
    plugins: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct LanSyncStatus {
    running: bool,
    port: Option<u16>,
}

fn normalize_table_name(table: &str) -> Result<String, String> {
    if table
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        Ok(table.to_string())
    } else {
        Err(format!("Invalid table name: {table}"))
    }
}

fn strip_file_url(value: &str) -> &str {
    value.strip_prefix("file://").unwrap_or(value)
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn db_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("surrealdb"))
}

fn restore_marker_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("restore-pending.json"))
}

fn backup_dir(app: &AppHandle, directory: String) -> Result<PathBuf, String> {
    let dir = if directory.trim().is_empty() {
        app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("backups")
    } else {
        PathBuf::from(directory)
    };
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn backup_info(path: &Path) -> Result<BackupInfo, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let id = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();

    Ok(BackupInfo {
        id,
        name,
        path: path.to_string_lossy().to_string(),
        created_at: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis().to_string())
            .unwrap_or_else(|| "0".to_string()),
        size: path_size(path)?,
    })
}

fn path_size(path: &Path) -> Result<u64, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.is_file() {
        return Ok(metadata.len());
    }

    let mut total = 0;
    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        total += path_size(&entry.map_err(|error| error.to_string())?.path())?;
    }
    Ok(total)
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(from).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        if source.is_dir() {
            copy_dir_recursive(&source, &target)?;
        } else {
            fs::copy(&source, &target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

async fn open_database(path: &Path) -> Result<Surreal<Db>, String> {
    let db = Surreal::new::<SurrealKv>(path.to_string_lossy().as_ref())
        .await
        .map_err(|error| error.to_string())?;
    db.use_ns("pulsar")
        .use_db("app")
        .await
        .map_err(|error| error.to_string())?;
    Ok(db)
}

async fn select_database_values(
    db: &Surreal<Db>,
    table: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let table = normalize_table_name(table)?;
    let sql = format!("SELECT resource_key, value FROM {table} ORDER BY resource_key");
    let mut result = db.query(sql).await.map_err(|error| error.to_string())?;
    let rows: Vec<DatabaseRecord> = result.take(0).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(|record| record.value).collect())
}

fn http_response(stream: &mut TcpStream, status: &str, body: &[u8]) -> Result<(), String> {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(header.as_bytes())
        .and_then(|_| stream.write_all(body))
        .map_err(|error| error.to_string())
}

fn handle_lan_connection(
    mut stream: TcpStream,
    pairing_key: &str,
    snapshot: &Arc<Mutex<serde_json::Value>>,
    pending: &Arc<Mutex<Vec<serde_json::Value>>>,
) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 8192];
    loop {
        let count = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..count]);
        if buffer.len() > 32 * 1024 * 1024 {
            return http_response(&mut stream, "413 Payload Too Large", br#"{"error":"snapshot too large"}"#);
        }
        if let Some(header_end) = buffer.windows(4).position(|value| value == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&buffer[..header_end + 4]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    line.split_once(':').and_then(|(name, value)| {
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    })
                })
                .unwrap_or(0);
            if buffer.len() >= header_end + 4 + content_length {
                break;
            }
        }
    }

    let Some(header_end) = buffer.windows(4).position(|value| value == b"\r\n\r\n") else {
        return http_response(&mut stream, "400 Bad Request", br#"{"error":"invalid request"}"#);
    };
    let headers = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = headers.lines();
    let request_line = lines.next().unwrap_or_default();
    let authorized = lines.any(|line| {
        line.split_once(':')
            .map(|(name, value)| {
                name.eq_ignore_ascii_case("x-pulsar-pairing-key")
                    && value.trim() == pairing_key
            })
            .unwrap_or(false)
    });
    if !authorized {
        return http_response(&mut stream, "401 Unauthorized", br#"{"error":"pairing key rejected"}"#);
    }

    if request_line.starts_with("GET /snapshot ") {
        let body = serde_json::to_vec(
            &*snapshot.lock().map_err(|_| "同步快照锁不可用".to_string())?,
        )
        .map_err(|error| error.to_string())?;
        return http_response(&mut stream, "200 OK", &body);
    }

    if request_line.starts_with("POST /snapshot ") {
        let value: serde_json::Value = serde_json::from_slice(&buffer[header_end + 4..])
            .map_err(|error| error.to_string())?;
        pending
            .lock()
            .map_err(|_| "同步队列锁不可用".to_string())?
            .push(value.clone());
        *snapshot
            .lock()
            .map_err(|_| "同步快照锁不可用".to_string())? = value;
        return http_response(&mut stream, "202 Accepted", br#"{"accepted":true}"#);
    }

    http_response(&mut stream, "404 Not Found", br#"{"error":"not found"}"#)
}

fn stop_lan_server(sync: &LanSyncState) -> Result<(), String> {
    let server = sync
        .server
        .lock()
        .map_err(|_| "同步服务锁不可用".to_string())?
        .take();
    if let Some(mut server) = server {
        server.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = server.handle.take() {
            let _ = handle.join();
        }
    }
    Ok(())
}

fn apply_pending_restore(app: &AppHandle) -> Result<(), String> {
    let marker = restore_marker_path(app)?;
    if !marker.exists() {
        return Ok(());
    }

    let pending: PendingRestore =
        serde_json::from_slice(&fs::read(&marker).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
    let backup_path = PathBuf::from(pending.backup_path);
    let source = backup_path.join("surrealdb");
    let target = db_dir(app)?;
    let old_target = app_data_dir(app)?.join(format!("surrealdb-before-restore-{}", timestamp_millis()));

    if target.exists() {
        fs::rename(&target, &old_target).map_err(|error| error.to_string())?;
    }
    copy_dir_recursive(&source, &target)?;
    let resource_source = backup_path.join("resources");
    if resource_source.exists() {
        copy_dir_recursive(
            &resource_source,
            &app_data_dir(app)?.join("resources"),
        )?;
    }
    let _ = fs::remove_file(marker);
    Ok(())
}

async fn app_db<'a>(app: &AppHandle, state: &'a AppState) -> Result<&'a Surreal<Db>, String> {
    state
        .db
        .get_or_try_init(|| async {
            apply_pending_restore(app)?;
            let data_dir = app_data_dir(app)?;
            fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
            let db_path = data_dir.join("surrealdb");
            open_database(&db_path).await
        })
        .await
}

async fn get_secret_value(db: &Surreal<Db>, name: &str) -> Result<Option<String>, String> {
    let mut result = db
        .query("SELECT name, value FROM secret WHERE name = $name LIMIT 1")
        .bind(("name", name.to_string()))
        .await
        .map_err(|error| error.to_string())?;
    let rows: Vec<SecretRecord> = result.take(0).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().next().map(|record| record.value))
}

async fn hydrate_placeholders(db: &Surreal<Db>, input: &str) -> Result<String, String> {
    let mut output = String::with_capacity(input.len());
    let mut rest = input;

    while let Some(start) = rest.find("<<") {
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];

        if let Some(end) = after_start.find(">>") {
            let key = &after_start[..end];
            let value = get_secret_value(db, key)
                .await?
                .ok_or_else(|| format!("Missing secret: {key}"))?;
            output.push_str(&value);
            rest = &after_start[end + 2..];
        } else {
            output.push_str(&rest[start..]);
            rest = "";
        }
    }

    output.push_str(rest);
    Ok(output)
}

#[tauri::command]
async fn secret_has(app: AppHandle, state: State<'_, AppState>, name: String) -> Result<bool, String> {
    let db = app_db(&app, &state).await?;
    Ok(get_secret_value(db, &name).await?.is_some_and(|value| !value.is_empty()))
}

#[tauri::command]
async fn secret_set(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    value: String,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    db.query("DELETE secret WHERE name = $name; CREATE secret CONTENT { name: $name, value: $value };")
        .bind(("name", name))
        .bind(("value", value))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn secret_clear_value(app: AppHandle, state: State<'_, AppState>, name: String) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    db.query("UPDATE secret SET value = '' WHERE name = $name")
        .bind(("name", name))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn secret_delete(app: AppHandle, state: State<'_, AppState>, name: String) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    db.query("DELETE secret WHERE name = $name")
        .bind(("name", name))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn config_get(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    let db = app_db(&app, &state).await?;
    let mut result = db
        .query("SELECT key, value FROM config WHERE key = $key LIMIT 1")
        .bind(("key", key))
        .await
        .map_err(|error| error.to_string())?;
    let rows: Vec<ConfigRecord> = result.take(0).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().next().map(|record| record.value))
}

#[tauri::command]
async fn config_set(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    db.query("DELETE config WHERE key = $key; CREATE config CONTENT { key: $key, value: $value };")
        .bind(("key", key))
        .bind(("value", value))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn config_delete(app: AppHandle, state: State<'_, AppState>, key: String) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    db.query("DELETE config WHERE key = $key")
        .bind(("key", key))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn database_select_all(
    app: AppHandle,
    state: State<'_, AppState>,
    table: String,
) -> Result<Vec<DatabaseRecord>, String> {
    let db = app_db(&app, &state).await?;
    let table = normalize_table_name(&table)?;
    let sql = format!("SELECT resource_key, value FROM {table} ORDER BY resource_key");
    let mut result = db.query(sql).await.map_err(|error| error.to_string())?;
    result.take(0).map_err(|error| error.to_string())
}

#[tauri::command]
async fn database_select_one(
    app: AppHandle,
    state: State<'_, AppState>,
    table: String,
    id: String,
) -> Result<Option<serde_json::Value>, String> {
    let db = app_db(&app, &state).await?;
    let table = normalize_table_name(&table)?;
    let sql = format!("SELECT resource_key, value FROM {table} WHERE resource_key = $id LIMIT 1");
    let mut result = db
        .query(sql)
        .bind(("id", id))
        .await
        .map_err(|error| error.to_string())?;
    let rows: Vec<DatabaseRecord> = result.take(0).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().next().map(|record| record.value))
}

#[tauri::command]
async fn database_upsert(
    app: AppHandle,
    state: State<'_, AppState>,
    table: String,
    id: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    let table = normalize_table_name(&table)?;
    let sql = format!("DELETE {table} WHERE resource_key = $id; CREATE {table} CONTENT {{ resource_key: $id, value: $value }};");
    db.query(sql)
        .bind(("id", id))
        .bind(("value", value))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn database_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    table: String,
    id: String,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    let table = normalize_table_name(&table)?;
    let sql = format!("DELETE {table} WHERE resource_key = $id");
    db.query(sql)
        .bind(("id", id))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn resource_save_image(
    app: AppHandle,
    bytes: Vec<u8>,
    extension: Option<String>,
) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let image_dir = data_dir.join("resources").join("images");
    fs::create_dir_all(&image_dir).map_err(|error| error.to_string())?;

    let extension = extension
        .unwrap_or_else(|| "png".to_string())
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>();
    let extension = if extension.is_empty() { "png".to_string() } else { extension };
    let file_name = format!("{}.{}", uuid::Uuid::new_v4(), extension);
    let file_path: PathBuf = image_dir.join(file_name);
    fs::write(&file_path, bytes).map_err(|error| error.to_string())?;

    Ok(format!("file://{}", file_path.to_string_lossy().replace('\\', "/")))
}

#[tauri::command]
async fn resource_delete_file(file_url: String) -> Result<(), String> {
    let path = strip_file_url(&file_url);
    fs::remove_file(path).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn backup_list(app: AppHandle, directory: String) -> Result<Vec<BackupInfo>, String> {
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

#[tauri::command]
async fn backup_create(
    app: AppHandle,
    state: State<'_, AppState>,
    directory: String,
    max_backups: String,
) -> Result<BackupInfo, String> {
    let _ = app_db(&app, &state).await?;
    let created_at = timestamp_millis().to_string();
    let manifest = BackupManifest {
        version: 1,
        created_at: created_at.clone(),
        kind: "surrealkv-directory".to_string(),
    };
    let dir = backup_dir(&app, directory.clone())?;
    let path = dir.join(format!("pulsarai-db-backup-{created_at}"));
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    copy_dir_recursive(&db_dir(&app)?, &path.join("surrealdb"))?;
    let resources = app_data_dir(&app)?.join("resources");
    if resources.exists() {
        copy_dir_recursive(&resources, &path.join("resources"))?;
    }
    fs::write(
        path.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    prune_backups(&app, directory, max_backups)?;
    backup_info(&path)
}

fn prune_backups(app: &AppHandle, directory: String, max_backups: String) -> Result<(), String> {
    if max_backups == "unlimited" {
        return Ok(());
    }

    let limit = max_backups.parse::<usize>().unwrap_or(10);
    let mut backups = backup_list_sync(app, directory)?;
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for backup in backups.into_iter().skip(limit) {
        let _ = fs::remove_dir_all(backup.path);
    }
    Ok(())
}

fn backup_list_sync(app: &AppHandle, directory: String) -> Result<Vec<BackupInfo>, String> {
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
async fn backup_restore(
    app: AppHandle,
    _state: State<'_, AppState>,
    directory: String,
    backup_id: String,
) -> Result<(), String> {
    let dir = backup_dir(&app, directory)?;
    let path = dir.join(backup_id);
    if !path.join("surrealdb").exists() {
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
async fn backup_read_resources(
    app: AppHandle,
    directory: String,
    backup_id: String,
) -> Result<BackupResourceSnapshot, String> {
    let path = backup_dir(&app, directory)?
        .join(backup_id)
        .join("surrealdb");
    if !path.exists() {
        return Err("备份目录中没有 surrealdb 数据。".to_string());
    }
    let db = open_database(&path).await?;
    Ok(BackupResourceSnapshot {
        packages: select_database_values(&db, "resource_packages").await?,
        conversations: select_database_values(&db, "resource_conversations").await?,
        containers: select_database_values(&db, "resource_message_containers").await?,
        plugins: select_database_values(&db, "resource_plugins").await?,
    })
}

#[tauri::command]
async fn backup_restore_resource_files(
    app: AppHandle,
    directory: String,
    backup_id: String,
) -> Result<(), String> {
    let source = backup_dir(&app, directory)?
        .join(backup_id)
        .join("resources");
    if source.exists() {
        copy_dir_recursive(&source, &app_data_dir(&app)?.join("resources"))?;
    }
    Ok(())
}

#[tauri::command]
async fn backup_delete(app: AppHandle, directory: String, backup_id: String) -> Result<(), String> {
    let dir = backup_dir(&app, directory)?;
    let path = dir.join(backup_id);
    fs::remove_dir_all(path).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn lan_sync_start(
    state: State<'_, AppState>,
    port: u16,
    pairing_key: String,
    snapshot: serde_json::Value,
) -> Result<LanSyncStatus, String> {
    if pairing_key.trim().len() < 6 {
        return Err("配对密钥至少需要 6 个字符。".to_string());
    }

    stop_lan_server(&state.lan_sync)?;
    *state
        .lan_sync
        .snapshot
        .lock()
        .map_err(|_| "同步快照锁不可用".to_string())? = snapshot;

    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|error| error.to_string())?;
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread_snapshot = Arc::clone(&state.lan_sync.snapshot);
    let thread_pending = Arc::clone(&state.lan_sync.pending);
    let thread_key = pairing_key.clone();
    let handle = thread::spawn(move || {
        while !thread_stop.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = handle_lan_connection(
                        stream,
                        &thread_key,
                        &thread_snapshot,
                        &thread_pending,
                    );
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(80));
                }
                Err(_) => break,
            }
        }
    });
    *state
        .lan_sync
        .server
        .lock()
        .map_err(|_| "同步服务锁不可用".to_string())? = Some(LanSyncServer {
        port,
        stop,
        handle: Some(handle),
    });
    Ok(LanSyncStatus {
        running: true,
        port: Some(port),
    })
}

#[tauri::command]
async fn lan_sync_stop(state: State<'_, AppState>) -> Result<(), String> {
    stop_lan_server(&state.lan_sync)
}

#[tauri::command]
async fn lan_sync_status(state: State<'_, AppState>) -> Result<LanSyncStatus, String> {
    let server = state
        .lan_sync
        .server
        .lock()
        .map_err(|_| "同步服务锁不可用".to_string())?;
    Ok(LanSyncStatus {
        running: server.is_some(),
        port: server.as_ref().map(|value| value.port),
    })
}

#[tauri::command]
async fn lan_sync_publish(
    state: State<'_, AppState>,
    snapshot: serde_json::Value,
) -> Result<(), String> {
    *state
        .lan_sync
        .snapshot
        .lock()
        .map_err(|_| "同步快照锁不可用".to_string())? = snapshot;
    Ok(())
}

#[tauri::command]
async fn lan_sync_take_pending(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut pending = state
        .lan_sync
        .pending
        .lock()
        .map_err(|_| "同步队列锁不可用".to_string())?;
    Ok(std::mem::take(&mut *pending))
}

#[tauri::command]
async fn lan_sync_fetch(
    state: State<'_, AppState>,
    address: String,
    pairing_key: String,
) -> Result<serde_json::Value, String> {
    let endpoint = format!("{}/snapshot", address.trim_end_matches('/'));
    state
        .http
        .get(endpoint)
        .header("x-pulsar-pairing-key", pairing_key)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn lan_sync_push(
    state: State<'_, AppState>,
    address: String,
    pairing_key: String,
    snapshot: serde_json::Value,
) -> Result<(), String> {
    let endpoint = format!("{}/snapshot", address.trim_end_matches('/'));
    state
        .http
        .post(endpoint)
        .header("x-pulsar-pairing-key", pairing_key)
        .json(&snapshot)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn model_proxy_fetch(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ProxyFetchRequest,
) -> Result<ProxyFetchResponse, String> {
    let db = app_db(&app, &state).await?;
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|error| error.to_string())?;
    let mut headers = HeaderMap::new();

    for header in request.headers {
        let value = hydrate_placeholders(db, &header.value).await?;
        headers.insert(
            HeaderName::from_str(&header.name).map_err(|error| error.to_string())?,
            HeaderValue::from_str(&value).map_err(|error| error.to_string())?,
        );
    }

    let body = match request.body {
        Some(bytes) => {
            let text = String::from_utf8(bytes.clone()).ok();
            match text {
                Some(text) => hydrate_placeholders(db, &text).await?.into_bytes(),
                None => bytes,
            }
        }
        None => Vec::new(),
    };

    let response = state
        .http
        .request(method, request.url)
        .headers(headers)
        .body(body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value.to_str().ok().map(|value| ProxyHeader {
                name: name.to_string(),
                value: value.to_string(),
            })
        })
        .collect();
    let body = response.bytes().await.map_err(|error| error.to_string())?.to_vec();

    Ok(ProxyFetchResponse { status, headers, body })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(AppState {
            db: OnceCell::const_new(),
            http: reqwest::Client::new(),
            lan_sync: LanSyncState::default(),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notifications::init());

    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(tauri_plugin_android_battery_optimization::init())
        .plugin(tauri_plugin_m3::init());

    builder
        .invoke_handler(tauri::generate_handler![
            secret_has,
            secret_set,
            secret_clear_value,
            secret_delete,
            config_get,
            config_set,
            config_delete,
            database_select_all,
            database_select_one,
            database_upsert,
            database_delete,
            resource_save_image,
            resource_delete_file,
            backup_list,
            backup_create,
            backup_restore,
            backup_read_resources,
            backup_restore_resource_files,
            backup_delete,
            lan_sync_start,
            lan_sync_stop,
            lan_sync_status,
            lan_sync_publish,
            lan_sync_take_pending,
            lan_sync_fetch,
            lan_sync_push,
            model_proxy_fetch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
