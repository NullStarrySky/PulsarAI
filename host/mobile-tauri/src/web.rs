use super::*;

pub(crate) async fn select_database_values(
    db: &Surreal<Db>,
    table: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let table = normalize_table_name(table)?;
    let sql = format!("SELECT resource_key, value FROM {table} ORDER BY resource_key");
    let mut result = db.query(sql).await.map_err(|error| error.to_string())?;
    let rows: Vec<DatabaseRecord> = result.take(0).map_err(|error| error.to_string())?;
    Ok(rows.into_iter().map(|record| record.value).collect())
}

#[tauri::command]
pub(crate) async fn model_proxy_fetch(
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
    let status = response.status();
    let url = response.url().to_string();
    let status_text = status.canonical_reason().unwrap_or_default().to_string();
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
        url,
        status: status.as_u16(),
        status_text,
        redirected: false,
        headers,
        body,
    })
}

#[tauri::command]
pub(crate) async fn proxy_fetch(
    state: State<'_, AppState>,
    request: ProxyFetchRequest,
) -> Result<ProxyFetchResponse, String> {
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|error| format!("无效请求方法：{error}"))?;
    let mut headers = HeaderMap::new();

    for header in request.headers {
        headers.insert(
            HeaderName::from_str(&header.name)
                .map_err(|error| format!("无效请求头名：{error}"))?,
            HeaderValue::from_str(&header.value)
                .map_err(|error| format!("无效请求头值：{error}"))?,
        );
    }

    let mut builder = state
        .http
        .request(method, request.url)
        .headers(headers);

    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    if let Some(timeout_ms) = request.timeout {
        builder = builder.timeout(std::time::Duration::from_millis(timeout_ms));
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("网络请求失败：{error}"))?;
    let status = response.status();
    let url = response.url().to_string();
    let redirected = response.status().is_redirection();
    let status_text = status.canonical_reason().unwrap_or_default().to_string();
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
        .map_err(|error| format!("网络响应读取失败：{error}"))?
        .to_vec();
    Ok(ProxyFetchResponse {
        url,
        status: status.as_u16(),
        status_text,
        redirected,
        headers,
        body,
    })
}
