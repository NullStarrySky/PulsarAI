use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use surrealdb::{
    engine::local::{Db, SurrealKv},
    Surreal,
};
use tauri::{AppHandle, Manager, State};
use tokio::sync::OnceCell;

struct AppState {
    db: OnceCell<Surreal<Db>>,
    http: reqwest::Client,
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
    #[serde(default)]
    redirect: Option<String>,
    #[serde(default)]
    timeout: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyFetchResponse {
    url: String,
    status: u16,
    status_text: String,
    redirected: bool,
    headers: Vec<ProxyHeader>,
    body: Vec<u8>,
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

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

mod database;
mod files;
mod media;
mod migration;
mod web;

use database::*;
use files::*;
use media::*;
use migration::{
    migration_read_binary, migration_read_png_character, migration_read_text, migration_scan_path,
};
use web::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(AppState {
            db: OnceCell::const_new(),
            http: reqwest::Client::new(),
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
            media_write,
            media_read,
            media_url,
            media_delete,
            model_proxy_fetch,
            proxy_fetch,
            migration_scan_path,
            migration_read_text,
            migration_read_binary,
            migration_read_png_character,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
