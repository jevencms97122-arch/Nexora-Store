//! Launching an app from its desktop shortcut, through the store.
//!
//! Desktop shortcuts of apps that don't update themselves are pointed at the store
//! (`nexora-store.exe --launch <id> "<real exe>"`). If the store is closed, a small window
//! checks for an update before starting the app. If it is already open, the app starts at once.
//! The real path stays in the shortcut, so it can always be put back as it was.

use crate::commands::{blocking, collect_lnks, data_dir, env_path, resolve_any, shell_open, CmdResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    app_id: String,
    path: String,
}

/// Reads `--launch <id> [path]` from a command line.
pub fn parse(args: &[String]) -> Option<LaunchRequest> {
    let i = args.iter().position(|a| a == "--launch")?;
    let app_id = crate::commands::safe_id(args.get(i + 1)?).ok()?;
    Some(LaunchRequest { app_id, path: args.get(i + 2).cloned().unwrap_or_default() })
}

/// The small "checking for updates" window.
pub fn open_window(app: &AppHandle, request: &LaunchRequest) -> tauri::Result<()> {
    let json = serde_json::to_string(request).unwrap_or_else(|_| "null".into());
    WebviewWindowBuilder::new(app, "launcher", WebviewUrl::App("index.html".into()))
        .title("Nexora Store")
        .inner_size(440.0, 236.0)
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .shadow(true)
        .center()
        .initialization_script(format!("window.__NEXORA_LAUNCH__={json};"))
        .build()?;
    Ok(())
}

/// Shows the store, creating its window if only the launcher was open.
pub fn show_main(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    if let Some(config) = app.config().app.windows.iter().find(|w| w.label == "main") {
        WebviewWindowBuilder::from_config(app, config)?.build()?;
    }
    Ok(())
}

/// Another `nexora-store.exe` was started while this one runs.
pub fn on_second_instance(app: &AppHandle, args: &[String]) {
    let app = app.clone();
    let request = parse(args);
    // Off the event loop: creating a window from here can deadlock on Windows.
    tauri::async_runtime::spawn(async move {
        match request {
            Some(r) if !r.path.is_empty() => {
                let _ = tauri::async_runtime::spawn_blocking(move || shell_open(Path::new(&r.path))).await;
            }
            _ => {
                let _ = show_main(&app);
            }
        }
    });
}

fn desktop_shortcuts() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for var in ["USERPROFILE", "OneDrive", "PUBLIC"] {
        if let Some(root) = env_path(var) {
            collect_lnks(&root.join("Desktop"), 3, &mut out);
        }
    }
    out
}

fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Script that redirects the shortcuts of `apps` to the store. With `prune`, shortcuts of apps
/// that are no longer in the list get their real target back.
fn shortcut_script(lnks: &[PathBuf], store: &Path, apps: &[(String, String)], prune: bool) -> String {
    let list = lnks.iter().map(|p| ps_quote(&p.to_string_lossy())).collect::<Vec<_>>().join(",");
    let ids = apps.iter().map(|(id, path)| format!("{}={}", ps_quote(id), ps_quote(path))).collect::<Vec<_>>().join(";");
    let store = ps_quote(&store.to_string_lossy());
    let prune = if prune { "$true" } else { "$false" };
    format!(
        "$s=New-Object -ComObject WScript.Shell;$q=[char]34;$store={store};$prune={prune};$ids=@{{{ids}}};$paths=@{{}};\
         foreach($k in $ids.Keys){{$paths[$ids[$k]]=$k}};\
         foreach($l in @({list})){{try{{\
           $c=$s.CreateShortcut($l);$t=$c.TargetPath;$a=$c.Arguments;\
           if($t -ieq $store){{\
             if($a -match '^--launch (\\S+) \\x22(.+)\\x22$'){{\
               $id=$Matches[1];$old=$Matches[2];\
               if($ids.ContainsKey($id)){{\
                 if($ids[$id] -ine $old){{$c.Arguments='--launch '+$id+' '+$q+$ids[$id]+$q;$c.IconLocation=$ids[$id]+',0';$c.Save()}}\
               }}elseif($prune){{$c.TargetPath=$old;$c.Arguments='';$c.Save()}}\
             }}\
           }}elseif($a -eq '' -and $paths.ContainsKey($t)){{\
             $i=$c.IconLocation;if($i -eq '' -or $i.StartsWith(',')){{$c.IconLocation=$t+',0'}};\
             $c.Arguments='--launch '+$paths[$t]+' '+$q+$t+$q;$c.TargetPath=$store;$c.Save()\
           }}\
         }}catch{{}}}}"
    )
}

#[cfg(windows)]
fn run_script(script: &str) -> CmdResult<()> {
    use std::os::windows::process::CommandExt;
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .status()
        .map_err(|e| e.to_string())?;
    if status.success() { Ok(()) } else { Err("Mise à jour des raccourcis impossible".into()) }
}

#[cfg(not(windows))]
fn run_script(_: &str) -> CmdResult<()> {
    Ok(())
}

/// Puts every redirected shortcut back (called by the store's uninstaller).
pub fn restore_all() {
    let (Ok(store), lnks) = (std::env::current_exe(), desktop_shortcuts()) else { return };
    if !lnks.is_empty() {
        let _ = run_script(&shortcut_script(&lnks, &store, &[], true));
    }
}

#[derive(Deserialize)]
pub struct ShortcutApp {
    id: String,
    path: String,
}

/// Keeps desktop shortcuts going through the store. Skipped in dev builds, whose exe is temporary.
#[tauri::command]
pub async fn sync_shortcuts(app: AppHandle, entries: Vec<ShortcutApp>, prune: bool) -> CmdResult<()> {
    if cfg!(debug_assertions) {
        return Ok(());
    }
    let base = data_dir(&app)?;
    blocking(move || {
        let store = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut apps = Vec::new();
        for e in entries {
            let id = crate::commands::safe_id(&e.id)?;
            let Ok(path) = resolve_any(&base, &e.path) else { continue };
            let is_exe = path.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe"));
            if is_exe && path.is_file() && path != store {
                apps.push((id, path.to_string_lossy().into_owned()));
            }
        }
        let lnks = desktop_shortcuts();
        if lnks.is_empty() { Ok(()) } else { run_script(&shortcut_script(&lnks, &store, &apps, prune)) }
    })
    .await
}

/// Whether the app is running: Windows refuses to open a running exe for writing.
#[tauri::command]
pub fn app_in_use(app: AppHandle, path: String) -> CmdResult<bool> {
    const ERROR_SHARING_VIOLATION: i32 = 32;
    let p = resolve_any(&data_dir(&app)?, &path)?;
    if !p.is_file() {
        return Ok(false);
    }
    Ok(std::fs::OpenOptions::new().write(true).open(p).is_err_and(|e| e.raw_os_error() == Some(ERROR_SHARING_VIOLATION)))
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    fn read(lnk: &Path) -> String {
        let script = format!("$c=(New-Object -ComObject WScript.Shell).CreateShortcut({});$c.TargetPath+'|'+$c.Arguments+'|'+$c.IconLocation", ps_quote(&lnk.to_string_lossy()));
        let out = std::process::Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script]).output().unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    #[test]
    fn shortcut_is_redirected_then_restored() {
        let dir = std::env::temp_dir().join(format!("nexora-lnk-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("L'app test.exe");
        let store = dir.join("store.exe");
        std::fs::write(&exe, b"x").unwrap();
        std::fs::write(&store, b"x").unwrap();
        let lnk = dir.join("App.lnk");
        let create = format!(
            "$c=(New-Object -ComObject WScript.Shell).CreateShortcut({});$c.TargetPath={};$c.Save()",
            ps_quote(&lnk.to_string_lossy()),
            ps_quote(&exe.to_string_lossy())
        );
        run_script(&create).unwrap();
        let exe_s = exe.to_string_lossy().into_owned();
        let lnks = vec![lnk.clone()];

        run_script(&shortcut_script(&lnks, &store, &[("abc123".into(), exe_s.clone())], true)).unwrap();
        let linked = read(&lnk);
        assert!(linked.starts_with(&format!("{}|--launch abc123 \"{exe_s}\"|", store.display())), "{linked}");
        assert!(linked.ends_with(&format!("{exe_s},0")), "icon kept: {linked}");

        // Without prune, an app missing from the list is left alone.
        run_script(&shortcut_script(&lnks, &store, &[], false)).unwrap();
        assert_eq!(read(&lnk), linked);

        run_script(&shortcut_script(&lnks, &store, &[], true)).unwrap();
        assert!(read(&lnk).starts_with(&format!("{exe_s}||")), "{}", read(&lnk));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_launch_arguments() {
        let args: Vec<String> = ["store.exe", "--launch", "abc123", "C:\\a b\\x.exe"].map(String::from).to_vec();
        let r = parse(&args).unwrap();
        assert_eq!((r.app_id.as_str(), r.path.as_str()), ("abc123", "C:\\a b\\x.exe"));
        assert!(parse(&["store.exe".to_string()]).is_none());
        assert!(parse(&["s".into(), "--launch".into(), "../bad".into()]).is_none());
    }
}
