use super::*;

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

pub(crate) async fn get_secret_value(
    db: &Surreal<Db>,
    name: &str,
) -> Result<Option<String>, String> {
    let mut result = db
        .query("SELECT name, value FROM secret WHERE name = $name LIMIT 1")
        .bind(("name", name.to_string()))
        .await
        .map_err(|error| error.to_string())?;
    let rows: Vec<SecretRecord> = result.take(0).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().next().map(|record| record.value))
}

pub(crate) async fn hydrate_placeholders(db: &Surreal<Db>, input: &str) -> Result<String, String> {
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
pub(crate) async fn secret_has(
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
pub(crate) async fn secret_preview(
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
pub(crate) async fn secret_set(
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
pub(crate) async fn secret_clear_value(
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
pub(crate) async fn secret_delete(
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
pub(crate) async fn config_get(
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
pub(crate) async fn config_set(
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
pub(crate) async fn config_delete(
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
pub(crate) async fn database_select_all(
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
pub(crate) async fn database_select_by_field(
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
pub(crate) async fn database_select_one(
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
pub(crate) async fn database_upsert(
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
pub(crate) async fn database_update(
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
pub(crate) async fn database_delete(
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
pub(crate) async fn database_reset_character_data(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = app_db(&app, &state).await?;
    let mut response = db
        .query(
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
        return Err(format!(
            "database_reset_character_data statement failed: {errors:?}"
        ));
    }

    let resources = app_data_dir(&app)?.join("resources");
    if resources.exists() {
        fs::remove_dir_all(&resources).map_err(|error| error.to_string())?;
    }
    fs::create_dir_all(&resources).map_err(|error| error.to_string())?;
    Ok(())
}
