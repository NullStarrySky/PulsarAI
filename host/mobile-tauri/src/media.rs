use super::*;
use base64::{engine::general_purpose::STANDARD, Engine as _};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaFile {
    id: String,
    media_type: String,
    size: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaBytes {
    id: String,
    media_type: String,
    size: usize,
    bytes: Vec<u8>,
}

fn media_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("resources").join("media"))
}

fn media_id(id: &str) -> Result<&str, String> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err("无效的媒体 ID。".to_string());
    }
    Ok(id)
}

fn media_dir(app: &AppHandle, value: Option<String>) -> Result<PathBuf, String> {
    let parts = value.unwrap_or_else(|| "root".to_string());
    let segments = parts
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if segments.is_empty()
        || segments.iter().any(|part| {
            !part.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
            })
        })
    {
        return Err("无效的媒体容器路径。".to_string());
    }
    Ok(segments
        .into_iter()
        .fold(media_root(app)?, |dir, part| dir.join(part)))
}

fn extension_for_media_type(media_type: &str) -> &'static str {
    match media_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/avif" => "avif",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "audio/mpeg" => "mp3",
        "audio/wav" => "wav",
        "audio/ogg" => "ogg",
        "application/pdf" => "pdf",
        _ => "bin",
    }
}

fn media_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn find_media_file(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let mut pending = vec![media_root(app)?];
    while let Some(directory) = pending.pop() {
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                pending.push(path);
            } else if path.is_file()
                && path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .is_some_and(|stem| stem == id)
            {
                return Ok(path);
            }
        }
    }
    Err("媒体文件不存在。".to_string())
}

#[tauri::command]
pub(crate) async fn media_write(
    app: AppHandle,
    bytes: Vec<u8>,
    media_type: String,
    path: Option<String>,
) -> Result<MediaFile, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let directory = media_dir(&app, path)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    fs::write(
        directory.join(format!("{}.{}", id, extension_for_media_type(&media_type))),
        &bytes,
    )
    .map_err(|error| error.to_string())?;
    Ok(MediaFile {
        id,
        media_type,
        size: bytes.len(),
    })
}

#[tauri::command]
pub(crate) async fn media_read(app: AppHandle, id: String) -> Result<MediaBytes, String> {
    let id = media_id(&id)?.to_string();
    let path = find_media_file(&app, &id)?;
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    Ok(MediaBytes {
        id,
        media_type: media_type_for_path(&path).to_string(),
        size: bytes.len(),
        bytes,
    })
}

#[tauri::command]
pub(crate) async fn media_url(app: AppHandle, id: String) -> Result<String, String> {
    let file = media_read(app, id).await?;
    Ok(format!(
        "data:{};base64,{}",
        file.media_type,
        STANDARD.encode(file.bytes)
    ))
}

#[tauri::command]
pub(crate) async fn media_delete(app: AppHandle, id: String) -> Result<(), String> {
    let path = find_media_file(&app, media_id(&id)?)?;
    fs::remove_file(path).map_err(|error| error.to_string())
}
