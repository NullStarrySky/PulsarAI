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

mod backup;
mod backup_commands;
mod database;
mod files;
mod lan_sync;
mod migration;
mod piper_tts;
mod stt;
mod web;

use backup_commands::*;
use database::*;
use files::*;
use lan_sync::*;
use migration::{
    migration_read_binary, migration_read_png_character, migration_read_text, migration_scan_path,
};
use web::*;

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
