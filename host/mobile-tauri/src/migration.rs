use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_SCAN_ENTRIES: usize = 100_000;
const MAX_TEXT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_BINARY_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationSourceEntry {
    path: String,
    relative_path: String,
    name: String,
    extension: String,
    size: u64,
    modified_at: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationScanResult {
    root_path: String,
    is_file: bool,
    entries: Vec<MigrationSourceEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationBinaryResult {
    media_type: String,
    base64: String,
}

#[tauri::command]
pub async fn migration_scan_path(path: String) -> Result<MigrationScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || scan_path(&path))
        .await
        .map_err(|error| format!("迁移扫描任务失败：{error}"))?
}

#[tauri::command]
pub async fn migration_read_text(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_text(&path))
        .await
        .map_err(|error| format!("迁移文本读取任务失败：{error}"))?
}

#[tauri::command]
pub async fn migration_read_binary(path: String) -> Result<MigrationBinaryResult, String> {
    tauri::async_runtime::spawn_blocking(move || read_binary(&path))
        .await
        .map_err(|error| format!("迁移媒体读取任务失败：{error}"))?
}

#[tauri::command]
pub async fn migration_read_png_character(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || read_png_character(&path))
        .await
        .map_err(|error| format!("角色卡读取任务失败：{error}"))?
}

fn canonical_file(path: &str) -> Result<PathBuf, String> {
    let canonical =
        fs::canonicalize(path).map_err(|error| format!("路径不可访问：{path}：{error}"))?;
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("无法读取路径元数据：{}：{error}", canonical.display()))?;
    if !metadata.is_file() {
        return Err(format!("路径不是文件：{}", canonical.display()));
    }
    Ok(canonical)
}

fn scan_path(input: &str) -> Result<MigrationScanResult, String> {
    let root =
        fs::canonicalize(input).map_err(|error| format!("路径不可访问：{input}：{error}"))?;
    let metadata = fs::metadata(&root)
        .map_err(|error| format!("无法读取路径元数据：{}：{error}", root.display()))?;
    if metadata.is_file() {
        let parent = root.parent().unwrap_or_else(|| Path::new(""));
        return Ok(MigrationScanResult {
            root_path: parent.to_string_lossy().into_owned(),
            is_file: true,
            entries: vec![entry_from_path(parent, &root, &metadata)?],
        });
    }
    if !metadata.is_dir() {
        return Err(format!("路径既不是文件也不是目录：{}", root.display()));
    }

    let mut entries = Vec::new();
    let mut pending = vec![root.clone()];
    while let Some(directory) = pending.pop() {
        let children = fs::read_dir(&directory)
            .map_err(|error| format!("无法扫描目录：{}：{error}", directory.display()))?;
        for child in children {
            let child = child.map_err(|error| format!("无法读取目录项：{error}"))?;
            let file_type = child.file_type().map_err(|error| {
                format!("无法读取文件类型：{}：{error}", child.path().display())
            })?;
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                pending.push(child.path());
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            let child_metadata = child.metadata().map_err(|error| {
                format!("无法读取文件元数据：{}：{error}", child.path().display())
            })?;
            entries.push(entry_from_path(&root, &child.path(), &child_metadata)?);
            if entries.len() > MAX_SCAN_ENTRIES {
                return Err(format!(
                    "扫描文件超过上限 {MAX_SCAN_ENTRIES}，请缩小导入目录。"
                ));
            }
        }
    }
    entries.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(MigrationScanResult {
        root_path: root.to_string_lossy().into_owned(),
        is_file: false,
        entries,
    })
}

fn entry_from_path(
    root: &Path,
    path: &Path,
    metadata: &fs::Metadata,
) -> Result<MigrationSourceEntry, String> {
    let relative = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("文件名不是有效 UTF-8：{}", path.display()))?
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let modified_at = metadata.modified().ok().and_then(system_time_millis);
    Ok(MigrationSourceEntry {
        path: path.to_string_lossy().into_owned(),
        relative_path: relative,
        name,
        extension,
        size: metadata.len(),
        modified_at,
    })
}

fn system_time_millis(value: SystemTime) -> Option<u64> {
    value
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
}

fn read_limited(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("无法读取文件元数据：{}：{error}", path.display()))?;
    if metadata.len() > limit {
        return Err(format!(
            "文件过大：{}（{} bytes，限制 {} bytes）",
            path.display(),
            metadata.len(),
            limit
        ));
    }
    let mut file = fs::File::open(path)
        .map_err(|error| format!("无法打开文件：{}：{error}", path.display()))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| format!("无法读取文件：{}：{error}", path.display()))?;
    Ok(bytes)
}

fn read_text(path: &str) -> Result<String, String> {
    let path = canonical_file(path)?;
    let bytes = read_limited(&path, MAX_TEXT_BYTES)?;
    String::from_utf8(bytes)
        .map_err(|error| format!("文件不是 UTF-8 文本：{}：{error}", path.display()))
}

fn read_binary(path: &str) -> Result<MigrationBinaryResult, String> {
    let path = canonical_file(path)?;
    let bytes = read_limited(&path, MAX_BINARY_BYTES)?;
    Ok(MigrationBinaryResult {
        media_type: media_type_for_path(&path).to_string(),
        base64: STANDARD.encode(bytes),
    })
}

fn media_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogg" => "video/ogg",
        _ => "application/octet-stream",
    }
}

fn read_png_character(path: &str) -> Result<String, String> {
    let path = canonical_file(path)?;
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("png")
    {
        return Err(format!("角色卡元数据读取只支持 PNG：{}", path.display()));
    }
    let bytes = read_limited(&path, MAX_BINARY_BYTES)?;
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(format!("文件不是有效 PNG：{}", path.display()));
    }

    let mut offset = 8usize;
    let mut candidates = Vec::new();
    while offset + 12 <= bytes.len() {
        let length = u32::from_be_bytes(
            bytes[offset..offset + 4]
                .try_into()
                .map_err(|_| "PNG chunk 长度无效")?,
        ) as usize;
        let chunk_end = offset
            .checked_add(12)
            .and_then(|value| value.checked_add(length))
            .ok_or_else(|| "PNG chunk 长度溢出".to_string())?;
        if chunk_end > bytes.len() {
            return Err(format!("PNG chunk 越界：{}", path.display()));
        }
        let chunk_type = &bytes[offset + 4..offset + 8];
        let data = &bytes[offset + 8..offset + 8 + length];
        if chunk_type == b"tEXt" {
            if let Some(separator) = data.iter().position(|byte| *byte == 0) {
                let keyword = String::from_utf8_lossy(&data[..separator]).to_ascii_lowercase();
                if keyword == "chara" || keyword == "ccv3" {
                    candidates.push((&data[separator + 1..], keyword));
                }
            }
        }
        offset = chunk_end;
        if chunk_type == b"IEND" {
            break;
        }
    }

    candidates.sort_by_key(|(_, keyword)| if keyword == "ccv3" { 0 } else { 1 });
    for (encoded, _) in candidates {
        let decoded = STANDARD.decode(encoded).map_err(|error| {
            format!(
                "角色卡 PNG 元数据不是有效 Base64：{}：{error}",
                path.display()
            )
        })?;
        let text = String::from_utf8(decoded)
            .map_err(|error| format!("角色卡 PNG 元数据不是 UTF-8：{}：{error}", path.display()))?;
        serde_json::from_str::<serde_json::Value>(&text).map_err(|error| {
            format!(
                "角色卡 PNG 元数据不是有效 JSON：{}：{error}",
                path.display()
            )
        })?;
        return Ok(text);
    }
    Err(format!(
        "PNG 不包含 chara 或 ccv3 角色卡元数据：{}",
        path.display()
    ))
}

#[cfg(test)]
mod tests {
    use super::{media_type_for_path, read_png_character};
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::{fs, path::Path};

    #[test]
    fn recognizes_common_migration_media_types() {
        assert_eq!(media_type_for_path(Path::new("avatar.png")), "image/png");
        assert_eq!(
            media_type_for_path(Path::new("background.webm")),
            "video/webm"
        );
    }

    #[test]
    fn reads_sillytavern_text_chunk() {
        let json = r#"{"spec":"chara_card_v2","data":{"name":"Reader Test"}}"#;
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        let encoded = STANDARD.encode(json);
        let text = [b"chara\0".as_slice(), encoded.as_bytes()].concat();
        append_chunk(&mut png, b"tEXt", &text);
        append_chunk(&mut png, b"IEND", &[]);
        let path =
            std::env::temp_dir().join(format!("pulsar-migration-{}.png", std::process::id()));
        fs::write(&path, png).expect("write synthetic PNG");
        let parsed = read_png_character(path.to_str().expect("UTF-8 temp path"));
        let _ = fs::remove_file(&path);
        assert_eq!(parsed.expect("read character chunk"), json);
    }

    fn append_chunk(target: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        target.extend_from_slice(&(data.len() as u32).to_be_bytes());
        target.extend_from_slice(kind);
        target.extend_from_slice(data);
        target.extend_from_slice(&[0; 4]);
    }
}
