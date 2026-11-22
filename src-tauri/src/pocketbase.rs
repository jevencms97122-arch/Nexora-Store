//! Talks to the PocketBase server for what the webview can't do well: streaming big
//! files up (new package, icon, screenshots) and down (the package to install), with progress.

use crate::commands::{data_dir, ext_of, name_of, resolve_any, safe_id, to_rel, CmdResult, Progress, StoredFile};
use futures_util::StreamExt;
use reqwest::multipart::{Form, Part};
use reqwest::{Body, Client};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

fn e2s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn client() -> CmdResult<Client> {
    Client::builder().connect_timeout(Duration::from_secs(15)).build().map_err(e2s)
}

#[derive(Deserialize)]
pub struct UploadFile {
    field: String,
    path: String,
}

/// Creates (`record_id` empty) or updates a record of the `apps` collection. Text values go as
/// form fields (a field may repeat, e.g. `screenshots-` for each file to delete) and files are
/// streamed from disk. Returns the record as JSON.
#[tauri::command]
pub async fn pb_save(
    app: AppHandle,
    base_url: String,
    token: String,
    record_id: Option<String>,
    fields: Vec<(String, String)>,
    files: Vec<UploadFile>,
    on_progress: Channel<Progress>,
) -> CmdResult<String> {
    let base = data_dir(&app)?;
    let base_url = base_url.trim_end_matches('/').to_string();

    let mut resolved: Vec<(String, PathBuf, u64)> = Vec::new();
    for f in files {
        let path = resolve_any(&base, &f.path)?;
        let len = std::fs::metadata(&path).map_err(|_| format!("Fichier introuvable : {}", f.path))?.len();
        resolved.push((f.field, path, len));
    }
    let total: u64 = resolved.iter().map(|(_, _, l)| *l).sum();
    let done = Arc::new(AtomicU64::new(0));
    let _ = on_progress.send(Progress { done: 0, total });

    let mut form = Form::new();
    for (k, v) in fields {
        form = form.text(k, v);
    }
    for (field, path, len) in resolved {
        let file = tokio::fs::File::open(&path).await.map_err(e2s)?;
        let done = done.clone();
        let channel = on_progress.clone();
        let stream = ReaderStream::new(file).map(move |chunk| {
            if let Ok(bytes) = &chunk {
                let now = done.fetch_add(bytes.len() as u64, Ordering::Relaxed) + bytes.len() as u64;
                let _ = channel.send(Progress { done: now.min(total), total });
            }
            chunk
        });
        let mime = mime_for(&path);
        let part = Part::stream_with_length(Body::wrap_stream(stream), len)
            .file_name(name_of(&path))
            .mime_str(mime)
            .map_err(e2s)?;
        form = form.part(field, part);
    }

    let http = client()?;
    let req = match &record_id {
        Some(id) => http.patch(format!("{base_url}/api/collections/apps/records/{}", safe_id(id)?)),
        None => http.post(format!("{base_url}/api/collections/apps/records")),
    };
    let res = req
        .header("Authorization", token)
        .multipart(form)
        .send()
        .await
        .map_err(|_| "Serveur PocketBase injoignable".to_string())?;
    let status = res.status();
    let text = res.text().await.map_err(e2s)?;
    if !status.is_success() {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(str::to_string))
            .unwrap_or_else(|| format!("Erreur du serveur ({status})"));
        return Err(msg);
    }
    let _ = on_progress.send(Progress { done: total, total });
    Ok(text)
}

fn mime_for(path: &std::path::Path) -> &'static str {
    match ext_of(path).as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}

/// Downloads a package into `library/<app_id>/` (the caller deletes it after installing).
#[tauri::command]
pub async fn download_package(
    app: AppHandle,
    app_id: String,
    url: String,
    file_name: String,
    on_progress: Channel<Progress>,
) -> CmdResult<StoredFile> {
    let id = safe_id(&app_id)?;
    let base = data_dir(&app)?;
    let ext = {
        let e = ext_of(std::path::Path::new(&file_name));
        if ["exe", "msi", "zip"].contains(&e.as_str()) { e } else { "exe".to_string() }
    };
    let dir = base.join("library").join(&id);
    tokio::fs::create_dir_all(&dir).await.map_err(e2s)?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let dst = dir.join(format!("package-{stamp}.{ext}"));
    let part = dir.join(format!("package-{stamp}.{ext}.part"));

    let res = client()?
        .get(&url)
        .send()
        .await
        .map_err(|_| "Serveur PocketBase injoignable".to_string())?;
    if !res.status().is_success() {
        return Err(format!("Téléchargement impossible ({})", res.status()));
    }
    let total = res.content_length().unwrap_or(0);
    let _ = on_progress.send(Progress { done: 0, total });

    let result: CmdResult<u64> = async {
        let mut out = tokio::fs::File::create(&part).await.map_err(e2s)?;
        let mut done = 0u64;
        let mut last = std::time::Instant::now();
        let mut stream = res.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| "Téléchargement interrompu".to_string())?;
            out.write_all(&chunk).await.map_err(e2s)?;
            done += chunk.len() as u64;
            if last.elapsed() >= Duration::from_millis(50) {
                last = std::time::Instant::now();
                let _ = on_progress.send(Progress { done: done.min(total.max(done)), total });
            }
        }
        out.flush().await.map_err(e2s)?;
        Ok(done)
    }
    .await;

    match result {
        Ok(size) => {
            tokio::fs::rename(&part, &dst).await.map_err(e2s)?;
            let _ = on_progress.send(Progress { done: size, total: size.max(total) });
            Ok(StoredFile { path: to_rel(&base, &dst), name: file_name, size })
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&part).await;
            Err(e)
        }
    }
}
