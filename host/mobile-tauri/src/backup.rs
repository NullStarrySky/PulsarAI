use super::*;

pub(crate) fn db_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("surrealdb"))
}

pub(crate) fn restore_marker_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("restore-pending.json"))
}

pub(crate) fn backup_dir(app: &AppHandle, directory: String) -> Result<PathBuf, String> {
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

pub(crate) fn backup_info(path: &Path) -> Result<BackupInfo, String> {
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

pub(crate) fn path_size(path: &Path) -> Result<u64, String> {
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

pub(crate) fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
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

pub(crate) fn read_backup_manifest(path: &Path) -> Result<BackupManifest, String> {
    serde_json::from_slice(
        &fs::read(path.join("manifest.json")).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

pub(crate) fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
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

pub(crate) fn relative_archive_path(
    prefix: &str,
    root: &Path,
    file: &Path,
) -> Result<String, String> {
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

pub(crate) fn collect_files(path: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
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

pub(crate) fn hash_file(path: &Path) -> Result<(String, u64), String> {
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

pub(crate) fn store_backup_object(
    backup_root: &Path,
    source: &Path,
) -> Result<(String, u64, u64), String> {
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

pub(crate) fn create_incremental_manifest(
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

pub(crate) fn materialize_manifest_files(
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

pub(crate) fn garbage_collect_backup_objects(backup_root: &Path) -> Result<(), String> {
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

pub(crate) fn write_resource_archive_file(
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

pub(crate) fn make_resource_paths_portable(
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

pub(crate) fn restore_resource_paths(value: &mut serde_json::Value, resources: &Path) {
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

pub(crate) fn read_resource_archive_header<R: Read>(
    reader: &mut R,
) -> Result<serde_json::Value, String> {
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

pub(crate) fn read_resource_archive_file(
    path: &Path,
    resources: &Path,
) -> Result<ResourceArchivePayload, String> {
    let input = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut decoder = zstd::stream::read::Decoder::new(input).map_err(|error| error.to_string())?;
    let mut payload = read_resource_archive_header(&mut decoder)?;
    restore_resource_paths(&mut payload, resources);
    serde_json::from_value(payload).map_err(|error| error.to_string())
}

pub(crate) fn restore_resource_archive_files(
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
