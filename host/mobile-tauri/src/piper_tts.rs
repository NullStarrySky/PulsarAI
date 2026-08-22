use bzip2::read::BzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sherpa_onnx::{
    GenerationConfig, OfflineTts, OfflineTtsConfig, OfflineTtsModelConfig,
    OfflineTtsVitsModelConfig,
};
use std::{
    fs,
    io::Cursor,
    path::{Component, Path, PathBuf},
};
use tar::Archive;
use tauri::{AppHandle, Manager};

const PIPER_RUNTIME: &str = "sherpa-onnx-piper";
const TOKENS_FILE: &str = "tokens.txt";
const ESPEAK_DIRECTORY: &str = "espeak-ng-data";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiperModelPack {
    pub id: String,
    pub version: String,
    pub sha256: String,
    pub size: u64,
    pub language: Option<String>,
    pub runtime: String,
    #[serde(default)]
    pub disk_size: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PiperModelEntry {
    #[serde(flatten)]
    pack: PiperModelPack,
    model_file: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiperDownloadRequest {
    pub pack: PiperModelPack,
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiperSynthesizeRequest {
    pub model_id: String,
    pub text: String,
    #[serde(default)]
    pub speaker: i32,
    #[serde(default = "default_speed")]
    pub speed: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiperSynthesis {
    pub audio: Vec<u8>,
    pub sample_rate: i32,
    pub model_id: String,
}

fn default_speed() -> f32 {
    1.0
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("tts")
        .join("piper");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(root(app)?.join("models.json"))
}

fn safe_segment(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err("模型 ID 或版本包含不安全字符。".to_string());
    }
    Ok(value)
}

fn model_directory(app: &AppHandle, pack: &PiperModelPack) -> Result<PathBuf, String> {
    Ok(root(app)?
        .join(safe_segment(&pack.id)?)
        .join(safe_segment(&pack.version)?))
}

fn load_index(app: &AppHandle) -> Result<Vec<PiperModelEntry>, String> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

fn save_index(app: &AppHandle, entries: &[PiperModelEntry]) -> Result<(), String> {
    fs::write(
        index_path(app)?,
        serde_json::to_vec_pretty(entries).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn directory_size(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }
    fs::read_dir(path)
        .map_err(|error| error.to_string())?
        .try_fold(0_u64, |total, item| {
            let item = item.map_err(|error| error.to_string())?;
            let metadata = item.metadata().map_err(|error| error.to_string())?;
            if metadata.is_file() {
                Ok(total.saturating_add(metadata.len()))
            } else if metadata.is_dir() {
                Ok(total.saturating_add(directory_size(&item.path())?))
            } else {
                Ok(total)
            }
        })
}

fn validate_pack(pack: &PiperModelPack) -> Result<(), String> {
    safe_segment(&pack.id)?;
    safe_segment(&pack.version)?;
    if pack.size == 0 {
        return Err("模型包大小必须大于零。".to_string());
    }
    if pack.sha256.len() != 64 || !pack.sha256.chars().all(|value| value.is_ascii_hexdigit()) {
        return Err("模型包 SHA-256 必须是 64 位十六进制值。".to_string());
    }
    if pack.runtime != PIPER_RUNTIME {
        return Err("模型包 runtime 必须为 sherpa-onnx-piper。".to_string());
    }
    Ok(())
}

fn verify(pack: &PiperModelPack, bytes: &[u8]) -> Result<(), String> {
    if pack.size != bytes.len() as u64 {
        return Err("模型包大小校验失败。".to_string());
    }
    let hash = format!("{:x}", Sha256::digest(bytes));
    if !hash.eq_ignore_ascii_case(&pack.sha256) {
        return Err("模型包 SHA-256 校验失败。".to_string());
    }
    Ok(())
}

fn archive_common_root(bytes: &[u8]) -> Result<Option<String>, String> {
    let decoder = BzDecoder::new(Cursor::new(bytes));
    let mut archive = Archive::new(decoder);
    let mut root: Option<String> = None;
    for entry in archive.entries().map_err(|error| error.to_string())? {
        let path = entry
            .map_err(|error| error.to_string())?
            .path()
            .map_err(|error| error.to_string())?
            .into_owned();
        let first = path
            .components()
            .next()
            .and_then(|component| match component {
                Component::Normal(value) => value.to_str().map(str::to_string),
                _ => None,
            });
        let Some(first) = first else { continue };
        match &root {
            Some(existing) if existing != &first => return Ok(None),
            None => root = Some(first),
            _ => {}
        }
    }
    Ok(root)
}

fn safe_archive_path(path: &Path, common_root: Option<&str>) -> Result<PathBuf, String> {
    let mut result = PathBuf::new();
    let mut components = path.components();
    if let (Some(root), Some(Component::Normal(first))) = (common_root, components.next()) {
        if first != root {
            return Err("Piper 模型包目录结构不一致。".to_string());
        }
    } else if common_root.is_none() {
        components = path.components();
    }
    for component in components {
        let Component::Normal(value) = component else {
            return Err("Piper 模型包包含不安全路径。".to_string());
        };
        result.push(value);
    }
    Ok(result)
}

fn extract_bundle(bytes: &[u8], destination: &Path) -> Result<String, String> {
    let common_root = archive_common_root(bytes)?;
    let decoder = BzDecoder::new(Cursor::new(bytes));
    let mut archive = Archive::new(decoder);
    for entry in archive.entries().map_err(|error| error.to_string())? {
        let mut entry = entry.map_err(|error| error.to_string())?;
        let relative = safe_archive_path(
            &entry.path().map_err(|error| error.to_string())?,
            common_root.as_deref(),
        )?;
        let target = destination.join(relative);
        if entry.header().entry_type().is_dir() {
            fs::create_dir_all(target).map_err(|error| error.to_string())?;
            continue;
        }
        if !entry.header().entry_type().is_file() {
            return Err("Piper 模型包不能包含链接或特殊文件。".to_string());
        }
        let parent = target
            .parent()
            .ok_or_else(|| "Piper 模型路径无效。".to_string())?;
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        let mut output = fs::File::create(target).map_err(|error| error.to_string())?;
        std::io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
    }
    let models = fs::read_dir(destination)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            (path.is_file()
                && path
                    .extension()
                    .is_some_and(|extension| extension == "onnx"))
            .then(|| entry.file_name().to_string_lossy().into_owned())
        })
        .collect::<Vec<_>>();
    if models.len() != 1
        || !destination.join(TOKENS_FILE).is_file()
        || !destination.join(ESPEAK_DIRECTORY).is_dir()
    {
        return Err("Piper 包必须包含一个根目录 ONNX、tokens.txt 与 espeak-ng-data/。".to_string());
    }
    Ok(models[0].clone())
}

fn install_bundle(
    app: &AppHandle,
    pack: &PiperModelPack,
    bytes: &[u8],
) -> Result<PiperModelEntry, String> {
    let destination = model_directory(app, pack)?;
    let parent = destination
        .parent()
        .ok_or_else(|| "模型路径无效。".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = parent.join(format!("{}.download", safe_segment(&pack.version)?));
    if temporary.exists() {
        fs::remove_dir_all(&temporary).map_err(|error| error.to_string())?;
    }
    fs::create_dir(&temporary).map_err(|error| error.to_string())?;
    let model_file = match extract_bundle(bytes, &temporary) {
        Ok(model_file) => model_file,
        Err(error) => {
            let _ = fs::remove_dir_all(&temporary);
            return Err(error);
        }
    };
    if destination.exists() {
        fs::remove_dir_all(&destination).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, &destination).map_err(|error| error.to_string())?;
    let mut pack = pack.clone();
    pack.disk_size = directory_size(&destination)?;
    Ok(PiperModelEntry { pack, model_file })
}

pub fn list(app: &AppHandle) -> Result<Vec<PiperModelPack>, String> {
    load_index(app)?
        .into_iter()
        .map(|mut entry| {
            entry.pack.disk_size = directory_size(&model_directory(app, &entry.pack)?)?;
            Ok(entry.pack)
        })
        .collect()
}

pub async fn download(
    app: &AppHandle,
    client: &reqwest::Client,
    input: PiperDownloadRequest,
) -> Result<PiperModelPack, String> {
    validate_pack(&input.pack)?;
    let bytes = client
        .get(input.url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .bytes()
        .await
        .map_err(|error| error.to_string())?
        .to_vec();
    verify(&input.pack, &bytes)?;
    let entry = install_bundle(app, &input.pack, &bytes)?;
    let mut entries = load_index(app)?;
    entries.retain(|item| item.pack.id != entry.pack.id);
    entries.push(entry.clone());
    save_index(app, &entries)?;
    Ok(entry.pack)
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut entries = load_index(app)?;
    let entry = entries
        .iter()
        .find(|item| item.pack.id == id)
        .cloned()
        .ok_or_else(|| "模型包不存在。".to_string())?;
    let directory = model_directory(app, &entry.pack)?;
    if directory.exists() {
        fs::remove_dir_all(directory).map_err(|error| error.to_string())?;
    }
    entries.retain(|item| item.pack.id != id);
    save_index(app, &entries)
}

fn wav_bytes(samples: &[f32], sample_rate: i32) -> Vec<u8> {
    let data_length = samples.len().saturating_mul(2) as u32;
    let mut output = Vec::with_capacity(44 + data_length as usize);
    output.extend_from_slice(b"RIFF");
    output.extend_from_slice(&(36_u32.saturating_add(data_length)).to_le_bytes());
    output.extend_from_slice(b"WAVEfmt ");
    output.extend_from_slice(&16_u32.to_le_bytes());
    output.extend_from_slice(&1_u16.to_le_bytes());
    output.extend_from_slice(&1_u16.to_le_bytes());
    output.extend_from_slice(&(sample_rate.max(1) as u32).to_le_bytes());
    output.extend_from_slice(&((sample_rate.max(1) as u32).saturating_mul(2)).to_le_bytes());
    output.extend_from_slice(&2_u16.to_le_bytes());
    output.extend_from_slice(&16_u16.to_le_bytes());
    output.extend_from_slice(b"data");
    output.extend_from_slice(&data_length.to_le_bytes());
    for sample in samples {
        let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16;
        output.extend_from_slice(&value.to_le_bytes());
    }
    output
}

pub async fn synthesize(
    app: &AppHandle,
    request: PiperSynthesizeRequest,
) -> Result<PiperSynthesis, String> {
    let text = request.text.trim().to_string();
    if text.is_empty() {
        return Err("Piper 合成文本不能为空。".to_string());
    }
    if !request.speed.is_finite() || !(0.25..=4.0).contains(&request.speed) {
        return Err("Piper 语速必须在 0.25 到 4 之间。".to_string());
    }
    let entry = load_index(app)?
        .into_iter()
        .find(|item| item.pack.id == request.model_id)
        .ok_or_else(|| "未安装指定 Piper 模型包。".to_string())?;
    validate_pack(&entry.pack)?;
    let directory = model_directory(app, &entry.pack)?;
    tauri::async_runtime::spawn_blocking(move || {
        let config = OfflineTtsConfig {
            model: OfflineTtsModelConfig {
                vits: OfflineTtsVitsModelConfig {
                    model: Some(
                        directory
                            .join(entry.model_file)
                            .to_string_lossy()
                            .into_owned(),
                    ),
                    tokens: Some(directory.join(TOKENS_FILE).to_string_lossy().into_owned()),
                    data_dir: Some(
                        directory
                            .join(ESPEAK_DIRECTORY)
                            .to_string_lossy()
                            .into_owned(),
                    ),
                    ..Default::default()
                },
                num_threads: 2,
                provider: Some("cpu".to_string()),
                ..Default::default()
            },
            ..Default::default()
        };
        let tts =
            OfflineTts::create(&config).ok_or_else(|| "无法加载 Piper 模型包。".to_string())?;
        let sample_rate = tts.sample_rate();
        let audio = tts
            .generate_with_config(
                &text,
                &GenerationConfig {
                    sid: request.speaker.max(0),
                    speed: request.speed,
                    ..Default::default()
                },
                None::<fn(&[f32], f32) -> bool>,
            )
            .ok_or_else(|| "Piper 合成失败。".to_string())?;
        Ok(PiperSynthesis {
            audio: wav_bytes(audio.samples(), sample_rate),
            sample_rate,
            model_id: entry.pack.id,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}
