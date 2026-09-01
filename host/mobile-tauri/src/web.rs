use super::*;

fn default_web_search_limit() -> usize {
    5
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSearchResult {
    title: String,
    url: String,
    snippet: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExaSearchResponse {
    #[serde(default)]
    results: Vec<ExaSearchItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExaSearchItem {
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    highlights: Vec<String>,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    text: String,
}

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
    let status = response.status().as_u16();
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
        status,
        headers,
        body,
    })
}

pub(crate) async fn exa_web_search(
    app: &AppHandle,
    state: &AppState,
    query: &str,
    limit: usize,
) -> Result<Vec<WebSearchResult>, String> {
    let db = app_db(app, state).await?;
    let api_key = get_secret_value(db, "webSearch.exa.apiKey")
        .await?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "请先在网络搜索设置中填写 Exa API Key。".to_string())?;
    let response = state
        .http
        .post("https://api.exa.ai/search")
        .header("x-api-key", api_key)
        .json(&serde_json::json!({
            "query": query,
            "type": "auto",
            "numResults": limit,
            "contents": { "highlights": true },
        }))
        .send()
        .await
        .map_err(|error| format!("Exa 搜索请求失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("Exa 搜索请求失败：{error}"))?;
    let response: ExaSearchResponse = response
        .json()
        .await
        .map_err(|error| format!("Exa 搜索响应无效：{error}"))?;
    Ok(response
        .results
        .into_iter()
        .filter_map(|result| {
            let title = result.title.trim().to_string();
            let url = result.url.trim().to_string();
            if title.is_empty() || url.is_empty() {
                return None;
            }
            let snippet = result
                .highlights
                .into_iter()
                .next()
                .filter(|value| !value.trim().is_empty())
                .or_else(|| (!result.summary.trim().is_empty()).then_some(result.summary))
                .unwrap_or(result.text)
                .chars()
                .take(1_200)
                .collect();
            Some(WebSearchResult {
                title,
                url,
                snippet,
            })
        })
        .collect())
}

#[tauri::command]
pub(crate) async fn web_search(
    app: AppHandle,
    state: State<'_, AppState>,
    request: WebSearchRequest,
) -> Result<Vec<WebSearchResult>, String> {
    let query = request.query.trim();
    if query.is_empty() {
        return Err("搜索关键词不能为空。".to_string());
    }
    let limit = request.limit.clamp(1, 10);
    match request.provider.as_deref().unwrap_or("exa") {
        "exa" => exa_web_search(&app, &state, query, limit).await,
        "playwright" => Err("Playwright 浏览器搜索仅在 Electron 桌面端可用。".to_string()),
        provider => Err(format!("未知网络搜索提供商：{provider}")),
    }
}
