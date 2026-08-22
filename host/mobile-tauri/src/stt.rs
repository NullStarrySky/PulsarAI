use hound::{SampleFormat, WavReader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Cursor, Read, Seek},
    path::PathBuf,
};
use tauri::{AppHandle, Manager};
use whisper_core::{device, transcribe as transcribe_with_candle, TranscribeOptions, WhisperModel};
use zip::ZipArchive;

const WHISPER_CANDLE_RUNTIME: &str = "whisper-candle-core";
const MODEL_CONFIG_FILE: &str = "config.json";
const MODEL_WEIGHTS_FILE: &str = "model.safetensors";
const GENERATION_CONFIG_FILE: &str = "generation_config.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModelPack {
    pub id: String,
    pub version: String,
    pub sha256: String,
    pub size: u64,
    pub language: Option<String>,
    pub runtime: String,
    #[serde(default)]
    pub disk_size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperDownloadRequest {
    pub pack: WhisperModelPack,
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperTranscribeRequest {
    pub model_id: String,
    pub audio: Vec<u8>,
    pub language: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperTranscription {
    pub text: String,
    pub model_id: String,
    pub language: Option<String>,
}

fn stt_root(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("stt")
        .join("whisper-candle");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(stt_root(app)?.join("models.json"))
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

fn model_directory(app: &AppHandle, pack: &WhisperModelPack) -> Result<PathBuf, String> {
    Ok(stt_root(app)?
        .join(safe_segment(&pack.id)?)
        .join(safe_segment(&pack.version)?))
}

fn load_index(app: &AppHandle) -> Result<Vec<WhisperModelPack>, String> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

fn save_index(app: &AppHandle, items: &[WhisperModelPack]) -> Result<(), String> {
    fs::write(
        index_path(app)?,
        serde_json::to_vec_pretty(items).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn directory_size(path: &PathBuf) -> Result<u64, String> {
    let mut total = 0_u64;
    if !path.exists() {
        return Ok(total);
    }
    for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        if metadata.is_file() {
            total = total.saturating_add(metadata.len());
        } else if metadata.is_dir() {
            total = total.saturating_add(directory_size(&entry.path())?);
        }
    }
    Ok(total)
}

fn validate_pack(pack: &WhisperModelPack) -> Result<(), String> {
    safe_segment(&pack.id)?;
    safe_segment(&pack.version)?;
    if pack.size == 0 {
        return Err("模型包大小必须大于零。".to_string());
    }
    if pack.sha256.len() != 64 || !pack.sha256.chars().all(|value| value.is_ascii_hexdigit()) {
        return Err("模型包 SHA-256 必须是 64 位十六进制值。".to_string());
    }
    if pack.runtime != WHISPER_CANDLE_RUNTIME {
        return Err("模型包 runtime 必须为 whisper-candle-core。".to_string());
    }
    Ok(())
}

fn verify(pack: &WhisperModelPack, bytes: &[u8]) -> Result<(), String> {
    if pack.size != bytes.len() as u64 {
        return Err("模型包大小校验失败。".to_string());
    }
    let hash = format!("{:x}", Sha256::digest(bytes));
    if !hash.eq_ignore_ascii_case(&pack.sha256) {
        return Err("模型包 SHA-256 校验失败。".to_string());
    }
    Ok(())
}

fn validate_bundle<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<(), String> {
    let mut files = BTreeMap::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = entry.name().to_string();
        if entry.is_dir() {
            continue;
        }
        if !matches!(
            name.as_str(),
            MODEL_CONFIG_FILE | MODEL_WEIGHTS_FILE | GENERATION_CONFIG_FILE
        ) {
            return Err(format!("Whisper 模型包包含未声明文件：{name}"));
        }
        if files.contains_key(&name) {
            return Err(format!("Whisper 模型包重复包含文件：{name}"));
        }
        files.insert(name, ());
    }
    for required in [MODEL_CONFIG_FILE, MODEL_WEIGHTS_FILE] {
        if !files.contains_key(required) {
            return Err(format!("Whisper 模型包缺少 {required}。"));
        }
    }
    Ok(())
}

fn install_bundle(app: &AppHandle, pack: &WhisperModelPack, bytes: &[u8]) -> Result<u64, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("Whisper 模型包必须是 ZIP 文件：{error}"))?;
    validate_bundle(&mut archive)?;
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
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let mut target =
            fs::File::create(temporary.join(entry.name())).map_err(|error| error.to_string())?;
        std::io::copy(&mut entry, &mut target).map_err(|error| error.to_string())?;
    }
    if destination.exists() {
        fs::remove_dir_all(&destination).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, &destination).map_err(|error| error.to_string())?;
    directory_size(&destination)
}

pub fn list(app: &AppHandle) -> Result<Vec<WhisperModelPack>, String> {
    let mut models = load_index(app)?;
    for model in &mut models {
        model.disk_size = directory_size(&model_directory(app, model)?)?;
    }
    Ok(models)
}

pub async fn download(
    app: &AppHandle,
    client: &reqwest::Client,
    mut input: WhisperDownloadRequest,
) -> Result<WhisperModelPack, String> {
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
    input.pack.disk_size = install_bundle(app, &input.pack, &bytes)?;
    let mut models = load_index(app)?;
    models.retain(|item| item.id != input.pack.id);
    models.push(input.pack.clone());
    save_index(app, &models)?;
    Ok(input.pack)
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut models = load_index(app)?;
    let pack = models
        .iter()
        .find(|item| item.id == id)
        .cloned()
        .ok_or_else(|| "模型包不存在。".to_string())?;
    let directory = model_directory(app, &pack)?;
    if directory.exists() {
        fs::remove_dir_all(directory).map_err(|error| error.to_string())?;
    }
    models.retain(|item| item.id != id);
    save_index(app, &models)
}

fn wav_to_16khz_mono(bytes: &[u8]) -> Result<Vec<f32>, String> {
    let mut reader = WavReader::new(Cursor::new(bytes))
        .map_err(|error| format!("Whisper 目前接收 WAV PCM 音频：{error}"))?;
    let spec = reader.spec();
    let channels = usize::from(spec.channels.max(1));
    let samples = match spec.sample_format {
        SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?,
        SampleFormat::Int => {
            let scale = (1_i64 << (spec.bits_per_sample.saturating_sub(1))).max(1) as f32;
            reader
                .samples::<i32>()
                .map(|sample| sample.map(|value| value as f32 / scale))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        }
    };
    let mono = samples
        .chunks(channels)
        .map(|frame| frame.iter().copied().sum::<f32>() / frame.len() as f32)
        .collect::<Vec<_>>();
    if spec.sample_rate == 16_000 {
        return Ok(mono);
    }
    let output_length = (mono.len() as u64 * 16_000 / u64::from(spec.sample_rate.max(1))) as usize;
    Ok((0..output_length)
        .map(|index| {
            let position = index as f64 * f64::from(spec.sample_rate) / 16_000_f64;
            let left = position.floor() as usize;
            let right = (left + 1).min(mono.len().saturating_sub(1));
            let fraction = (position - left as f64) as f32;
            mono.get(left).copied().unwrap_or_default() * (1.0 - fraction)
                + mono.get(right).copied().unwrap_or_default() * fraction
        })
        .collect())
}

pub async fn transcribe(
    app: &AppHandle,
    input: WhisperTranscribeRequest,
) -> Result<WhisperTranscription, String> {
    let pack = load_index(app)?
        .into_iter()
        .find(|item| item.id == input.model_id)
        .ok_or_else(|| "未安装指定 Whisper 模型包。".to_string())?;
    validate_pack(&pack)?;
    let directory = model_directory(app, &pack)?;
    let model_id = pack.id.clone();
    let language = input
        .language
        .filter(|value| !value.trim().is_empty() && value != "auto");
    tauri::async_runtime::spawn_blocking(move || {
        let audio = wav_to_16khz_mono(&input.audio)?;
        let device = device("cpu").map_err(|error| error.to_string())?;
        let mut model = WhisperModel::load(
            directory.join(MODEL_CONFIG_FILE),
            directory.join(MODEL_WEIGHTS_FILE),
            &device,
        )
        .map_err(|error| error.to_string())?;
        let generation_config = directory.join(GENERATION_CONFIG_FILE);
        if generation_config.exists() {
            model
                .set_alignment_heads_from_file(generation_config)
                .map_err(|error| error.to_string())?;
        }
        let mut options = TranscribeOptions::default();
        options.decode_options.language = language.clone();
        options.decode_options.beam_size = Some(5);
        let result = transcribe_with_candle(&mut model, &audio, &options)
            .map_err(|error| error.to_string())?;
        Ok(WhisperTranscription {
            text: result.text,
            model_id,
            language: Some(result.language),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}
