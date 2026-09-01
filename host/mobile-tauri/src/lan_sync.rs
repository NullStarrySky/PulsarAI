use super::*;

fn http_response(stream: &mut TcpStream, status: &str, body: &[u8]) -> Result<(), String> {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(header.as_bytes())
        .and_then(|_| stream.write_all(body))
        .map_err(|error| error.to_string())
}

pub(crate) fn handle_lan_connection(
    mut stream: TcpStream,
    pairing_key: &str,
    snapshot: &Arc<Mutex<serde_json::Value>>,
    pending: &Arc<Mutex<Vec<serde_json::Value>>>,
) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 8192];
    loop {
        let count = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..count]);
        if buffer.len() > 32 * 1024 * 1024 {
            return http_response(
                &mut stream,
                "413 Payload Too Large",
                br#"{"error":"snapshot too large"}"#,
            );
        }
        if let Some(header_end) = buffer.windows(4).position(|value| value == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&buffer[..header_end + 4]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    line.split_once(':').and_then(|(name, value)| {
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    })
                })
                .unwrap_or(0);
            if buffer.len() >= header_end + 4 + content_length {
                break;
            }
        }
    }

    let Some(header_end) = buffer.windows(4).position(|value| value == b"\r\n\r\n") else {
        return http_response(
            &mut stream,
            "400 Bad Request",
            br#"{"error":"invalid request"}"#,
        );
    };
    let headers = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = headers.lines();
    let request_line = lines.next().unwrap_or_default();
    let authorized = lines.any(|line| {
        line.split_once(':')
            .map(|(name, value)| {
                name.eq_ignore_ascii_case("x-pulsar-pairing-key") && value.trim() == pairing_key
            })
            .unwrap_or(false)
    });
    if !authorized {
        return http_response(
            &mut stream,
            "401 Unauthorized",
            br#"{"error":"pairing key rejected"}"#,
        );
    }

    if request_line.starts_with("GET /snapshot ") {
        let body = serde_json::to_vec(
            &*snapshot
                .lock()
                .map_err(|_| "同步快照锁不可用".to_string())?,
        )
        .map_err(|error| error.to_string())?;
        return http_response(&mut stream, "200 OK", &body);
    }

    if request_line.starts_with("POST /snapshot ") {
        let value: serde_json::Value =
            serde_json::from_slice(&buffer[header_end + 4..]).map_err(|error| error.to_string())?;
        pending
            .lock()
            .map_err(|_| "同步队列锁不可用".to_string())?
            .push(value.clone());
        *snapshot
            .lock()
            .map_err(|_| "同步快照锁不可用".to_string())? = value;
        return http_response(&mut stream, "202 Accepted", br#"{"accepted":true}"#);
    }

    http_response(&mut stream, "404 Not Found", br#"{"error":"not found"}"#)
}

pub(crate) fn stop_lan_server(sync: &LanSyncState) -> Result<(), String> {
    let server = sync
        .server
        .lock()
        .map_err(|_| "同步服务锁不可用".to_string())?
        .take();
    if let Some(mut server) = server {
        server.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = server.handle.take() {
            let _ = handle.join();
        }
    }
    Ok(())
}

async fn lan_sync_start(
    state: State<'_, AppState>,
    port: u16,
    pairing_key: String,
    snapshot: serde_json::Value,
) -> Result<LanSyncStatus, String> {
    if pairing_key.trim().len() < 6 {
        return Err("配对密钥至少需要 6 个字符。".to_string());
    }

    stop_lan_server(&state.lan_sync)?;
    *state
        .lan_sync
        .snapshot
        .lock()
        .map_err(|_| "同步快照锁不可用".to_string())? = snapshot;

    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|error| error.to_string())?;
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    let thread_snapshot = Arc::clone(&state.lan_sync.snapshot);
    let thread_pending = Arc::clone(&state.lan_sync.pending);
    let thread_key = pairing_key.clone();
    let handle = thread::spawn(move || {
        while !thread_stop.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = handle_lan_connection(
                        stream,
                        &thread_key,
                        &thread_snapshot,
                        &thread_pending,
                    );
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(80));
                }
                Err(_) => break,
            }
        }
    });
    *state
        .lan_sync
        .server
        .lock()
        .map_err(|_| "同步服务锁不可用".to_string())? = Some(LanSyncServer {
        port,
        stop,
        handle: Some(handle),
    });
    Ok(LanSyncStatus {
        running: true,
        port: Some(port),
    })
}

#[tauri::command]
pub(crate) async fn lan_sync_stop(state: State<'_, AppState>) -> Result<(), String> {
    stop_lan_server(&state.lan_sync)
}

#[tauri::command]
pub(crate) async fn lan_sync_status(state: State<'_, AppState>) -> Result<LanSyncStatus, String> {
    let server = state
        .lan_sync
        .server
        .lock()
        .map_err(|_| "同步服务锁不可用".to_string())?;
    Ok(LanSyncStatus {
        running: server.is_some(),
        port: server.as_ref().map(|value| value.port),
    })
}

#[tauri::command]
pub(crate) async fn lan_sync_publish(
    state: State<'_, AppState>,
    snapshot: serde_json::Value,
) -> Result<(), String> {
    *state
        .lan_sync
        .snapshot
        .lock()
        .map_err(|_| "同步快照锁不可用".to_string())? = snapshot;
    Ok(())
}

#[tauri::command]
pub(crate) async fn lan_sync_take_pending(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let mut pending = state
        .lan_sync
        .pending
        .lock()
        .map_err(|_| "同步队列锁不可用".to_string())?;
    Ok(std::mem::take(&mut *pending))
}

#[tauri::command]
pub(crate) async fn lan_sync_fetch(
    state: State<'_, AppState>,
    address: String,
    pairing_key: String,
) -> Result<serde_json::Value, String> {
    let endpoint = format!("{}/snapshot", address.trim_end_matches('/'));
    state
        .http
        .get(endpoint)
        .header("x-pulsar-pairing-key", pairing_key)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn lan_sync_push(
    state: State<'_, AppState>,
    address: String,
    pairing_key: String,
    snapshot: serde_json::Value,
) -> Result<(), String> {
    let endpoint = format!("{}/snapshot", address.trim_end_matches('/'));
    state
        .http
        .post(endpoint)
        .header("x-pulsar-pairing-key", pairing_key)
        .json(&snapshot)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;
    Ok(())
}
