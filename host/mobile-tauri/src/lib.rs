use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
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
use surrealdb::{
    engine::local::{Db, SurrealKv},
    Surreal,
};
use tauri::{AppHandle, Manager, State};
use tokio::sync::OnceCell;

mod migration;
mod piper_tts;
mod stt;
use migration::{
    migration_read_binary, migration_read_png_character, migration_read_text, migration_scan_path,
};

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
    id: Option<String>,
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
    #[serde(default)]
    files: Vec<BackupFileEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BackupFileEntry {
    path: String,
    object: String,
    size: u64,
    compressed_size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct PendingRestore {
    backup_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct BackupResourceSnapshot {
    packages: Vec<serde_json::Value>,
    conversations: Vec<serde_json::Value>,
    containers: Vec<serde_json::Value>,
    worlds: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ResourceArchivePayload {
    #[serde(rename = "rootType")]
    root_type: String,
    #[serde(rename = "rootId")]
    root_id: String,
    snapshot: BackupResourceSnapshot,
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
        app.path()
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
    let manifest = read_backup_manifest(path).ok();
    let size = match manifest.as_ref() {
        Some(value) if value.version >= 2 => {
            value.files.iter().map(|entry| entry.compressed_size).sum()
        }
        _ => path_size(path)?,
    };
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
        created_at: manifest
            .as_ref()
            .map(|value| value.created_at.clone())
            .unwrap_or_else(|| {
                metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis().to_string())
                    .unwrap_or_else(|| "0".to_string())
            }),
        size,
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

const BACKUP_OBJECT_DIR: &str = ".pulsarai-objects";
const RESOURCE_ARCHIVE_MAGIC: &[u8] = b"PULSAR_RESOURCE_ZST_V1\n";
const RESOURCE_ARCHIVE_URL_PREFIX: &str = "pulsar-resource://";

fn read_backup_manifest(path: &Path) -> Result<BackupManifest, String> {
    serde_json::from_slice(
        &fs::read(path.join("manifest.json")).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute() {
        return Err("归档中包含绝对路径".to_string());
    }
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(part) => result.push(part),
            _ => return Err("归档中包含不安全路径".to_string()),
        }
    }
    if result.as_os_str().is_empty() {
        return Err("归档路径为空".to_string());
    }
    Ok(result)
}

fn relative_archive_path(prefix: &str, root: &Path, file: &Path) -> Result<String, String> {
    let relative = file.strip_prefix(root).map_err(|error| error.to_string())?;
    let mut parts = vec![prefix.to_string()];
    for component in relative.components() {
        match component {
            std::path::Component::Normal(part) => {
                parts.push(part.to_string_lossy().to_string());
            }
            _ => return Err("无法生成备份相对路径".to_string()),
        }
    }
    Ok(parts.join("/"))
}

fn collect_files(path: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_file() {
        output.push(path.to_path_buf());
        return Ok(());
    }
    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        collect_files(&entry.map_err(|error| error.to_string())?.path(), output)?;
    }
    Ok(())
}

fn hash_file(path: &Path) -> Result<(String, u64), String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        size += count as u64;
    }
    Ok((format!("{:x}", hasher.finalize()), size))
}

fn store_backup_object(backup_root: &Path, source: &Path) -> Result<(String, u64, u64), String> {
    let object_dir = backup_root.join(BACKUP_OBJECT_DIR);
    fs::create_dir_all(&object_dir).map_err(|error| error.to_string())?;
    let temporary = object_dir.join(format!("object.tmp-{}", uuid::Uuid::new_v4()));
    let mut input = fs::File::open(source).map_err(|error| error.to_string())?;
    let output = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    let mut encoder =
        zstd::stream::write::Encoder::new(output, 3).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut size = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = input.read(&mut buffer).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
        size += count as u64;
        encoder
            .write_all(&buffer[..count])
            .map_err(|error| error.to_string())?;
    }
    encoder.finish().map_err(|error| error.to_string())?;

    let hash = format!("{:x}", hasher.finalize());
    let target = object_dir.join(format!("{hash}.zst"));
    if target.exists() {
        fs::remove_file(&temporary).map_err(|error| error.to_string())?;
    } else {
        fs::rename(&temporary, &target).map_err(|error| error.to_string())?;
    }
    let compressed_size = fs::metadata(&target)
        .map_err(|error| error.to_string())?
        .len();
    Ok((hash, size, compressed_size))
}

fn create_incremental_manifest(
    backup_root: &Path,
    created_at: String,
    sources: &[(&str, PathBuf)],
) -> Result<BackupManifest, String> {
    let mut files = Vec::new();
    for (prefix, root) in sources {
        let mut source_files = Vec::new();
        collect_files(root, &mut source_files)?;
        source_files.sort();
        for source in source_files {
            let (object, size, compressed_size) = store_backup_object(backup_root, &source)?;
            files.push(BackupFileEntry {
                path: relative_archive_path(prefix, root, &source)?,
                object,
                size,
                compressed_size,
            });
        }
    }
    Ok(BackupManifest {
        version: 2,
        created_at,
        kind: "surrealkv-zstd-incremental".to_string(),
        files,
    })
}

fn materialize_manifest_files(
    backup_root: &Path,
    manifest: &BackupManifest,
    target: &Path,
    prefix: Option<&str>,
) -> Result<(), String> {
    for entry in &manifest.files {
        if entry.object.len() != 64
            || !entry
                .object
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err("备份清单包含无效对象标识".to_string());
        }
        let relative = safe_relative_path(&entry.path)?;
        if let Some(required_prefix) = prefix {
            if relative
                .components()
                .next()
                .and_then(|value| value.as_os_str().to_str())
                != Some(required_prefix)
            {
                continue;
            }
        }
        let destination = target.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let object = backup_root
            .join(BACKUP_OBJECT_DIR)
            .join(format!("{}.zst", entry.object));
        let input = fs::File::open(&object).map_err(|error| error.to_string())?;
        let output = fs::File::create(&destination).map_err(|error| error.to_string())?;
        zstd::stream::copy_decode(input, output).map_err(|error| error.to_string())?;
        let (actual_hash, actual_size) = hash_file(&destination)?;
        if actual_hash != entry.object || actual_size != entry.size {
            let _ = fs::remove_file(&destination);
            return Err(format!("备份对象校验失败：{}", entry.path));
        }
    }
    Ok(())
}

fn garbage_collect_backup_objects(backup_root: &Path) -> Result<(), String> {
    let mut referenced = HashSet::new();
    for entry in fs::read_dir(backup_root).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if !path.is_dir() || !path.join("manifest.json").exists() {
            continue;
        }
        let manifest = read_backup_manifest(&path)?;
        referenced.extend(manifest.files.into_iter().map(|entry| entry.object));
    }
    let object_dir = backup_root.join(BACKUP_OBJECT_DIR);
    if !object_dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&object_dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        let Some(name) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let is_object = path.extension().and_then(|value| value.to_str()) == Some("zst");
        if !is_object || !referenced.contains(name) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

fn write_resource_archive_file(
    path: &Path,
    payload: &ResourceArchivePayload,
    resources: &Path,
) -> Result<(), String> {
    let output = fs::File::create(path).map_err(|error| error.to_string())?;
    let mut encoder =
        zstd::stream::write::Encoder::new(output, 3).map_err(|error| error.to_string())?;
    encoder
        .write_all(RESOURCE_ARCHIVE_MAGIC)
        .map_err(|error| error.to_string())?;
    let resource_root = resources
        .canonicalize()
        .unwrap_or_else(|_| resources.to_path_buf());
    let mut portable_payload = serde_json::to_value(payload).map_err(|error| error.to_string())?;
    let resource_files = make_resource_paths_portable(&mut portable_payload, &resource_root)?;
    let snapshot = serde_json::to_vec(&portable_payload).map_err(|error| error.to_string())?;
    encoder
        .write_all(&(snapshot.len() as u64).to_le_bytes())
        .and_then(|_| encoder.write_all(&snapshot))
        .map_err(|error| error.to_string())?;

    let mut files = resource_files.into_iter().collect::<Vec<_>>();
    files.sort();
    for file in files {
        let relative = relative_archive_path("", &resource_root, &file)?
            .trim_start_matches('/')
            .to_string();
        let name = relative.as_bytes();
        let size = fs::metadata(&file)
            .map_err(|error| error.to_string())?
            .len();
        encoder
            .write_all(&(name.len() as u32).to_le_bytes())
            .and_then(|_| encoder.write_all(name))
            .and_then(|_| encoder.write_all(&size.to_le_bytes()))
            .map_err(|error| error.to_string())?;
        let mut input = fs::File::open(file).map_err(|error| error.to_string())?;
        std::io::copy(&mut input, &mut encoder).map_err(|error| error.to_string())?;
    }
    encoder
        .write_all(&0_u32.to_le_bytes())
        .map_err(|error| error.to_string())?;
    encoder.finish().map_err(|error| error.to_string())?;
    Ok(())
}

fn make_resource_paths_portable(
    value: &mut serde_json::Value,
    resources: &Path,
) -> Result<HashSet<PathBuf>, String> {
    let mut files = HashSet::new();
    let root = resources
        .canonicalize()
        .unwrap_or_else(|_| resources.to_path_buf());

    fn visit(value: &mut serde_json::Value, root: &Path, files: &mut HashSet<PathBuf>) {
        match value {
            serde_json::Value::String(text) => {
                let raw_path = strip_file_url(text);
                if !text.starts_with("file://") && !Path::new(raw_path).is_absolute() {
                    return;
                }
                let candidate = PathBuf::from(raw_path);
                let canonical = candidate
                    .canonicalize()
                    .unwrap_or_else(|_| candidate.clone());
                if canonical.is_file() && canonical.starts_with(root) {
                    if let Ok(relative) = canonical.strip_prefix(root) {
                        let relative = relative
                            .components()
                            .filter_map(|component| match component {
                                std::path::Component::Normal(part) => {
                                    Some(part.to_string_lossy().to_string())
                                }
                                _ => None,
                            })
                            .collect::<Vec<_>>()
                            .join("/");
                        *text = format!("{RESOURCE_ARCHIVE_URL_PREFIX}{relative}");
                        files.insert(canonical);
                    }
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    visit(item, root, files);
                }
            }
            serde_json::Value::Object(object) => {
                for item in object.values_mut() {
                    visit(item, root, files);
                }
            }
            _ => {}
        }
    }

    visit(value, &root, &mut files);
    Ok(files)
}

fn restore_resource_paths(value: &mut serde_json::Value, resources: &Path) {
    match value {
        serde_json::Value::String(text) => {
            if let Some(relative) = text.strip_prefix(RESOURCE_ARCHIVE_URL_PREFIX) {
                if let Ok(relative) = safe_relative_path(relative) {
                    *text = format!(
                        "file://{}",
                        resources
                            .join(relative)
                            .to_string_lossy()
                            .replace('\\', "/"),
                    );
                }
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                restore_resource_paths(item, resources);
            }
        }
        serde_json::Value::Object(object) => {
            for item in object.values_mut() {
                restore_resource_paths(item, resources);
            }
        }
        _ => {}
    }
}

fn read_resource_archive_header<R: Read>(reader: &mut R) -> Result<serde_json::Value, String> {
    let mut magic = vec![0_u8; RESOURCE_ARCHIVE_MAGIC.len()];
    reader
        .read_exact(&mut magic)
        .map_err(|error| error.to_string())?;
    if magic != RESOURCE_ARCHIVE_MAGIC {
        return Err("不是受支持的 Pulsar 资源归档".to_string());
    }
    let mut length = [0_u8; 8];
    reader
        .read_exact(&mut length)
        .map_err(|error| error.to_string())?;
    let length = u64::from_le_bytes(length);
    if length > 128 * 1024 * 1024 {
        return Err("资源归档元数据过大".to_string());
    }
    let mut snapshot = vec![0_u8; length as usize];
    reader
        .read_exact(&mut snapshot)
        .map_err(|error| error.to_string())?;
    serde_json::from_slice(&snapshot).map_err(|error| error.to_string())
}

fn read_resource_archive_file(
    path: &Path,
    resources: &Path,
) -> Result<ResourceArchivePayload, String> {
    let input = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut decoder = zstd::stream::read::Decoder::new(input).map_err(|error| error.to_string())?;
    let mut payload = read_resource_archive_header(&mut decoder)?;
    restore_resource_paths(&mut payload, resources);
    serde_json::from_value(payload).map_err(|error| error.to_string())
}

fn restore_resource_archive_files(
    archive_path: &Path,
    target: &Path,
    overwrite: bool,
) -> Result<(), String> {
    let input = fs::File::open(archive_path).map_err(|error| error.to_string())?;
    let mut decoder = zstd::stream::read::Decoder::new(input).map_err(|error| error.to_string())?;
    let _ = read_resource_archive_header(&mut decoder)?;
    loop {
        let mut name_length = [0_u8; 4];
        decoder
            .read_exact(&mut name_length)
            .map_err(|error| error.to_string())?;
        let name_length = u32::from_le_bytes(name_length);
        if name_length == 0 {
            break;
        }
        if name_length > 64 * 1024 {
            return Err("资源归档路径过长".to_string());
        }
        let mut name = vec![0_u8; name_length as usize];
        decoder
            .read_exact(&mut name)
            .map_err(|error| error.to_string())?;
        let relative =
            safe_relative_path(std::str::from_utf8(&name).map_err(|error| error.to_string())?)?;
        let mut size = [0_u8; 8];
        decoder
            .read_exact(&mut size)
            .map_err(|error| error.to_string())?;
        let mut remaining = u64::from_le_bytes(size);
        let destination = target.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let should_write = overwrite || !destination.exists();
        let mut output = should_write
            .then(|| fs::File::create(&destination))
            .transpose()
            .map_err(|error| error.to_string())?;
        let mut buffer = [0_u8; 64 * 1024];
        while remaining > 0 {
            let chunk_size = remaining.min(buffer.len() as u64) as usize;
            let count = decoder
                .read(&mut buffer[..chunk_size])
                .map_err(|error| error.to_string())?;
            if count == 0 {
                return Err("资源归档提前结束".to_string());
            }
            if let Some(output) = output.as_mut() {
                output
                    .write_all(&buffer[..count])
                    .map_err(|error| error.to_string())?;
            }
            remaining -= count as u64;
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebSearchRequest {
    query: String,
    #[serde(default = "default_web_search_limit")]
    limit: usize,
    provider: Option<String>,
}

fn default_web_search_limit() -> usize {
    5
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSearchResult {
    title: String,
    url: String,
    snippet: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExaSearchResponse {
    #[serde(default)]
    results: Vec<ExaSearchItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExaSearchItem {
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    highlights: Vec<String>,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    text: String,
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
            return http_response(
                &mut stream,
                "413 Payload Too Large",
                br#"{"error":"snapshot too large"}"#,
            );
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
        return http_response(
            &mut stream,
            "400 Bad Request",
            br#"{"error":"invalid request"}"#,
        );
    };
    let headers = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = headers.lines();
    let request_line = lines.next().unwrap_or_default();
    let authorized = lines.any(|line| {
        line.split_once(':')
            .map(|(name, value)| {
                name.eq_ignore_ascii_case("x-pulsar-pairing-key") && value.trim() == pairing_key
            })
            .unwrap_or(false)
    });
    if !authorized {
        return http_response(
            &mut stream,
            "401 Unauthorized",
            br#"{"error":"pairing key rejected"}"#,
        );
    }

    if request_line.starts_with("GET /snapshot ") {
        let body = serde_json::to_vec(
            &*snapshot
                .lock()
                .map_err(|_| "同步快照锁不可用".to_string())?,
        )
        .map_err(|error| error.to_string())?;
        return http_response(&mut stream, "200 OK", &body);
    }

    if request_line.starts_with("POST /snapshot ") {
        let value: serde_json::Value =
            serde_json::from_slice(&buffer[header_end + 4..]).map_err(|error| error.to_string())?;
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

async fn app_db<'a>(app: &AppHandle, state: &'a AppState) -> Result<&'a Surreal<Db>, String> {
    state
        .db
        .get_or_try_init(|| async {
            apply_pending_restore(app)?;
            let data_dir = app_data_dir(app)?;
            fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
            let db_path = data_dir.join("surrealdb");
            let db = open_database(&db_path).await?;
            Ok(db)
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
async fn secret_has(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<bool, String> {
    let db = app_db(&app, &state).await?;
    Ok(get_secret_value(db, &name)
        .await?
        .is_some_and(|value| !value.is_empty()))
}

#[tauri::command]
async fn secret_preview(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<String, String> {
    let db = app_db(&app, &state).await?;
    let Some(value) = get_secret_value(db, &name)
        .await?
        .filter(|value| !value.is_empty())
    else {
        return Ok(String::new());
    };
    let characters: Vec<char> = value.chars().collect();
    if characters.len() <= 6 {
        return Ok(format!(
            "{}…{}",
            characters[0],
            characters[characters.len() - 1]
        ));
    }
    if characters.len() <= 12 {
        return Ok(format!(
            "{}…{}",
            characters[..4].iter().collect::<String>(),
            characters[characters.len() - 2..]
                .iter()
                .collect::<String>()
        ));
    }
    Ok(format!(
        "{}…{}",
        characters[..8].iter().collect::<String>(),
        characters[characters.len() - 4..]
            .iter()
            .collect::<String>()
    ))
}

#[tauri::command]
async fn secret_set(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    value: String,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    db.query(
        "DELETE secret WHERE name = $name; CREATE secret CONTENT { name: $name, value: $value };",
    )
    .bind(("name", name))
    .bind(("value", value))
    .await
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn secret_clear_value(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    db.query("UPDATE secret SET value = '' WHERE name = $name")
        .bind(("name", name))
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
async fn secret_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> Result<(), String> {
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
async fn config_delete(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> Result<(), String> {
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
async fn database_select_by_field(
    app: AppHandle,
    state: State<'_, AppState>,
    table: String,
    field: String,
    value: String,
) -> Result<Vec<DatabaseRecord>, String> {
    let db = app_db(&app, &state).await?;
    let table = normalize_table_name(&table)?;
    let field = match field.as_str() {
        "packageId" | "conversationid" => field,
        _ => return Err("unsupported resource field".to_owned()),
    };
    let sql = format!("SELECT resource_key, value FROM {table} WHERE value.{field} = $value ORDER BY resource_key");
    let mut result = db
        .query(sql)
        .bind(("value", value))
        .await
        .map_err(|error| error.to_string())?;
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
    let mut response = db
        .query(
            "UPSERT type::thing($table_name, $id) \
             CONTENT { resource_key: $id, value: $value }",
        )
        .bind(("table_name", table))
        .bind(("id", id))
        .bind(("value", value))
        .await
        .map_err(|error| error.to_string())?;
    let errors = response.take_errors();
    if !errors.is_empty() {
        return Err(format!("database_upsert statement failed: {errors:?}"));
    }
    Ok(())
}

#[tauri::command]
async fn database_update(
    app: AppHandle,
    state: State<'_, AppState>,
    table: String,
    id: String,
    patches: serde_json::Value,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    let table = normalize_table_name(&table)?;
    let mut response = db
        .query("UPDATE type::thing($table_name, $id) PATCH $patches")
        .bind(("table_name", table))
        .bind(("id", id))
        .bind(("patches", patches))
        .await
        .map_err(|error| error.to_string())?;
    let errors = response.take_errors();
    if !errors.is_empty() {
        return Err(format!("database_update statement failed: {errors:?}"));
    }
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
    let mut response = db
        .query(sql)
        .bind(("id", id))
        .await
        .map_err(|error| error.to_string())?;
    let errors = response.take_errors();
    if !errors.is_empty() {
        return Err(format!("database_delete statement failed: {errors:?}"));
    }
    Ok(())
}

#[tauri::command]
async fn database_reset_character_data(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    let mut response = db.query(
        "BEGIN TRANSACTION; \
         DELETE resource_conversation_memory_segments; \
         DELETE resource_message_containers; \
         DELETE resource_conversations; \
         DELETE resource_package_categories; \
         DELETE resource_packages; \
         DELETE resource_worlds; \
         COMMIT TRANSACTION;",
    )
    .await
    .map_err(|error| error.to_string())?;
    let errors = response.take_errors();
    if !errors.is_empty() {
        return Err(format!("database_reset_character_data statement failed: {errors:?}"));
    }

    let resources = app_data_dir(&app)?.join("resources");
    if resources.exists() {
        fs::remove_dir_all(&resources).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&resources).map_err(|error| error.to_string())?;
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
    let extension = if extension.is_empty() {
        "png".to_string()
    } else {
        extension
    };
    let file_name = format!("{}.{}", uuid::Uuid::new_v4(), extension);
    let file_path: PathBuf = image_dir.join(file_name);
    fs::write(&file_path, bytes).map_err(|error| error.to_string())?;

    Ok(format!(
        "file://{}",
        file_path.to_string_lossy().replace('\\', "/")
    ))
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

fn prune_backups(app: &AppHandle, directory: String, max_backups: String) -> Result<(), String> {
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
async fn backup_read_resources(
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
async fn backup_restore_resource_files(
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
async fn backup_delete(app: AppHandle, directory: String, backup_id: String) -> Result<(), String> {
    let dir = backup_dir(&app, directory)?;
    let path = dir.join(backup_id);
    fs::remove_dir_all(path).map_err(|error| error.to_string())?;
    garbage_collect_backup_objects(&dir)?;
    Ok(())
}

#[tauri::command]
async fn resource_archive_write(
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

#[tauri::command]
async fn resource_archive_read(
    app: AppHandle,
    path: String,
) -> Result<ResourceArchivePayload, String> {
    read_resource_archive_file(Path::new(&path), &app_data_dir(&app)?.join("resources"))
}

#[tauri::command]
async fn resource_archive_restore_files(
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
    let body = response
        .bytes()
        .await
        .map_err(|error| error.to_string())?
        .to_vec();

    Ok(ProxyFetchResponse {
        status,
        headers,
        body,
    })
}

async fn exa_web_search(
    app: &AppHandle,
    state: &AppState,
    query: &str,
    limit: usize,
) -> Result<Vec<WebSearchResult>, String> {
    let db = app_db(app, state).await?;
    let api_key = get_secret_value(db, "webSearch.exa.apiKey")
        .await?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "请先在网络搜索设置中填写 Exa API Key。".to_string())?;
    let response = state
        .http
        .post("https://api.exa.ai/search")
        .header("x-api-key", api_key)
        .json(&serde_json::json!({
            "query": query,
            "type": "auto",
            "numResults": limit,
            "contents": { "highlights": true },
        }))
        .send()
        .await
        .map_err(|error| format!("Exa 搜索请求失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("Exa 搜索请求失败：{error}"))?;
    let response: ExaSearchResponse = response
        .json()
        .await
        .map_err(|error| format!("Exa 搜索响应无效：{error}"))?;
    Ok(response
        .results
        .into_iter()
        .filter_map(|result| {
            let title = result.title.trim().to_string();
            let url = result.url.trim().to_string();
            if title.is_empty() || url.is_empty() {
                return None;
            }
            let snippet = result
                .highlights
                .into_iter()
                .next()
                .filter(|value| !value.trim().is_empty())
                .or_else(|| (!result.summary.trim().is_empty()).then_some(result.summary))
                .unwrap_or(result.text)
                .chars()
                .take(1_200)
                .collect();
            Some(WebSearchResult { title, url, snippet })
        })
        .collect())
}

#[tauri::command]
async fn web_search(
    app: AppHandle,
    state: State<'_, AppState>,
    request: WebSearchRequest,
) -> Result<Vec<WebSearchResult>, String> {
    let query = request.query.trim();
    if query.is_empty() {
        return Err("搜索关键词不能为空。".to_string());
    }
    let limit = request.limit.clamp(1, 10);
    match request.provider.as_deref().unwrap_or("exa") {
        "exa" => exa_web_search(&app, &state, query, limit).await,
        "playwright" => Err("Playwright 浏览器搜索仅在 Electron 桌面端可用。".to_string()),
        provider => Err(format!("未知网络搜索提供商：{provider}")),
    }
}

#[tauri::command]
fn stt_whisper_candle_models(app: AppHandle) -> Result<Vec<stt::WhisperModelPack>, String> {
    stt::list(&app)
}

#[tauri::command]
async fn stt_whisper_candle_download(
    app: AppHandle,
    state: State<'_, AppState>,
    request: stt::WhisperDownloadRequest,
) -> Result<stt::WhisperModelPack, String> {
    stt::download(&app, &state.http, request).await
}

#[tauri::command]
fn stt_whisper_candle_delete(app: AppHandle, id: String) -> Result<(), String> {
    stt::delete(&app, &id)
}

#[tauri::command]
async fn stt_transcribe(
    app: AppHandle,
    request: stt::WhisperTranscribeRequest,
) -> Result<stt::WhisperTranscription, String> {
    stt::transcribe(&app, request).await
}

#[tauri::command]
fn tts_piper_models(app: AppHandle) -> Result<Vec<piper_tts::PiperModelPack>, String> {
    piper_tts::list(&app)
}

#[tauri::command]
async fn tts_piper_download(
    app: AppHandle,
    state: State<'_, AppState>,
    request: piper_tts::PiperDownloadRequest,
) -> Result<piper_tts::PiperModelPack, String> {
    piper_tts::download(&app, &state.http, request).await
}

#[tauri::command]
fn tts_piper_delete(app: AppHandle, id: String) -> Result<(), String> {
    piper_tts::delete(&app, &id)
}

#[tauri::command]
async fn tts_piper_synthesize(
    app: AppHandle,
    request: piper_tts::PiperSynthesizeRequest,
) -> Result<piper_tts::PiperSynthesis, String> {
    piper_tts::synthesize(&app, request).await
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
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_tts::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notifications::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_stt::init());

    #[cfg(target_os = "android")]
    let builder = builder
        .plugin(tauri_plugin_android_battery_optimization::init())
        .plugin(tauri_plugin_m3::init());

    builder
        .invoke_handler(tauri::generate_handler![
            secret_has,
            secret_preview,
            secret_set,
            secret_clear_value,
            secret_delete,
            config_get,
            config_set,
            config_delete,
            database_select_all,
            database_select_by_field,
            database_select_one,
            database_upsert,
            database_update,
            database_delete,
            database_reset_character_data,
            resource_save_image,
            resource_delete_file,
            backup_list,
            backup_create,
            backup_restore,
            backup_read_resources,
            backup_restore_resource_files,
            backup_delete,
            resource_archive_write,
            resource_archive_read,
            resource_archive_restore_files,
            lan_sync_start,
            lan_sync_stop,
            lan_sync_status,
            lan_sync_publish,
            lan_sync_take_pending,
            lan_sync_fetch,
            lan_sync_push,
            model_proxy_fetch,
            web_search,
            stt_whisper_candle_models,
            stt_whisper_candle_download,
            stt_whisper_candle_delete,
            stt_transcribe,
            tts_piper_models,
            tts_piper_download,
            tts_piper_delete,
            tts_piper_synthesize,
            migration_scan_path,
            migration_read_text,
            migration_read_binary,
            migration_read_png_character,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
