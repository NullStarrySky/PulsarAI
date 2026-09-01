use super::*;

pub(crate) async fn resource_save_image(
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
pub(crate) async fn resource_delete_file(file_url: String) -> Result<(), String> {
    let path = strip_file_url(&file_url);
    fs::remove_file(path).map_err(|error| error.to_string())?;
    Ok(())
}
