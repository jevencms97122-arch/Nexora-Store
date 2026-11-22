//! File operations for the local store: importing packages and images into the
//! library, installing (copy or unzip) with progress, launching and cleaning up.
//!
//! Every path exchanged with the frontend is relative to the app data dir
//! (`%APPDATA%/com.nexora.store`), so the store keeps working if that folder moves.

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

type CmdResult<T> = Result<T, String>;

const PACKAGE_EXTS: &[&str] = &["exe", "msi", "zip"];
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico"];
/// Executables that are almost never the one to launch.
const NOT_LAUNCHERS: &[&str] = &["unins", "crash", "redist", "dxsetup", "dotnet", "helper", "updater", "report"];

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn data_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    let dir = app.path().app_data_dir().map_err(err)?;
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}

fn safe_id(id: &str) -> CmdResult<String> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok { Ok(id.to_string()) } else { Err("Identifiant d'application invalide".into()) }
}

/// Resolves a data-dir-relative path, refusing anything that could escape the folder.
fn resolve(base: &Path, rel: &str) -> CmdResult<PathBuf> {
    let rel_path = Path::new(rel);
    if rel.is_empty() || rel_path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("Chemin invalide : {rel}"));
    }
    Ok(base.join(rel_path))
}

fn to_rel(base: &Path, p: &Path) -> String {
    p.strip_prefix(base).unwrap_or(p).to_string_lossy().replace('\\', "/")
}

fn ext_of(p: &Path) -> String {
    p.extension().and_then(OsStr::to_str).unwrap_or("").to_ascii_lowercase()
}

fn name_of(p: &Path) -> String {
    p.file_name().and_then(OsStr::to_str).unwrap_or("fichier").to_string()
}

/// Paths saved by the store are relative to the data dir; the path of an app installed by
/// its own installer (e.g. `C:\Program Files\...\app.exe`) is absolute.
fn resolve_any(base: &Path, path: &str) -> CmdResult<PathBuf> {
    let p = Path::new(path);
    if p.is_absolute() { Ok(p.to_path_buf()) } else { resolve(base, path) }
}

/// A name that is unique even when several files are stored within the same millisecond.
fn unique_stem() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    format!("{ms}{}", COUNTER.fetch_add(1, Ordering::Relaxed) % 1000)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> CmdResult<T> + Send + 'static) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(err)?
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
pub struct Progress {
    done: u64,
    total: u64,
}

struct Reporter<'a> {
    channel: &'a Channel<Progress>,
    total: u64,
    done: u64,
    last: Instant,
}

impl<'a> Reporter<'a> {
    fn new(channel: &'a Channel<Progress>, total: u64) -> Self {
        let _ = channel.send(Progress { done: 0, total });
        Self { channel, total, done: 0, last: Instant::now() }
    }

    fn add(&mut self, n: u64) {
        self.done += n;
        if self.last.elapsed() >= Duration::from_millis(50) {
            self.last = Instant::now();
            let _ = self.channel.send(Progress { done: self.done.min(self.total), total: self.total });
        }
    }

    fn finish(&self) {
        let _ = self.channel.send(Progress { done: self.total, total: self.total });
    }
}

fn stream(input: &mut impl Read, output: &mut impl Write, rep: &mut Reporter, buf: &mut [u8]) -> std::io::Result<()> {
    loop {
        let n = input.read(buf)?;
        if n == 0 {
            return output.flush();
        }
        output.write_all(&buf[..n])?;
        rep.add(n as u64);
    }
}

/// Copies through a `.part` file so a crash never leaves a half-written file behind.
fn copy_with_progress(src: &Path, dst: &Path, rep: &mut Reporter) -> CmdResult<()> {
    let part = dst.with_file_name(format!("{}.part", name_of(dst)));
    let result = (|| {
        let mut input = File::open(src)?;
        let mut output = File::create(&part)?;
        let mut buf = vec![0u8; 1 << 20];
        stream(&mut input, &mut output, rep, &mut buf)?;
        drop(output);
        fs::rename(&part, dst)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&part);
    }
    result.map_err(err)
}

// ---------------------------------------------------------------------------
// Commands: adding apps to the library
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    name: String,
    size: u64,
    extension: String,
}

/// Name, size and extension of a file the user just picked or dropped.
#[tauri::command]
pub fn file_info(path: String) -> CmdResult<FileInfo> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|_| "Fichier introuvable".to_string())?;
    if !meta.is_file() {
        return Err("Ce n'est pas un fichier".into());
    }
    Ok(FileInfo { name: name_of(&p), size: meta.len(), extension: ext_of(&p) })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredFile {
    path: String,
    name: String,
    size: u64,
}

/// Copies a picked image into `staging/` so the form can preview it before saving.
#[tauri::command]
pub async fn stage_image(app: AppHandle, src: String) -> CmdResult<StoredFile> {
    let base = data_dir(&app)?;
    blocking(move || {
        let src = PathBuf::from(src);
        let ext = ext_of(&src);
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            return Err("Format d'image non supporté".into());
        }
        let dir = base.join("staging");
        fs::create_dir_all(&dir).map_err(err)?;
        let dst = dir.join(format!("{}.{ext}", unique_stem()));
        let size = fs::copy(&src, &dst).map_err(err)?;
        Ok(StoredFile { path: to_rel(&base, &dst), name: name_of(&src), size })
    })
    .await
}

/// Copies an `.exe`, `.msi` or `.zip` into `library/<app_id>/`.
#[tauri::command]
pub async fn import_package(
    app: AppHandle,
    app_id: String,
    src: String,
    on_progress: Channel<Progress>,
) -> CmdResult<StoredFile> {
    let id = safe_id(&app_id)?;
    let base = data_dir(&app)?;
    blocking(move || {
        let src = PathBuf::from(src);
        let ext = ext_of(&src);
        if !PACKAGE_EXTS.contains(&ext.as_str()) {
            return Err("Formats acceptés : .exe, .msi ou .zip".into());
        }
        let size = fs::metadata(&src).map_err(|_| "Fichier introuvable".to_string())?.len();
        let dir = base.join("library").join(&id);
        fs::create_dir_all(&dir).map_err(err)?;
        let dst = dir.join(format!("package-{}.{ext}", unique_stem()));
        let mut rep = Reporter::new(&on_progress, size);
        copy_with_progress(&src, &dst, &mut rep)?;
        rep.finish();
        Ok(StoredFile { path: to_rel(&base, &dst), name: name_of(&src), size })
    })
    .await
}

/// Moves staged images into `library/<app_id>/`. Paths already in the library are kept.
#[tauri::command]
pub fn commit_images(app: AppHandle, app_id: String, paths: Vec<String>) -> CmdResult<Vec<String>> {
    let id = safe_id(&app_id)?;
    let base = data_dir(&app)?;
    let dir = base.join("library").join(&id);
    fs::create_dir_all(&dir).map_err(err)?;
    paths
        .into_iter()
        .map(|rel| {
            if !rel.starts_with("staging/") {
                return Ok(rel);
            }
            let src = resolve(&base, &rel)?;
            let dst = dir.join(format!("img-{}.{}", unique_stem(), ext_of(&src)));
            fs::rename(&src, &dst).or_else(|_| fs::copy(&src, &dst).map(|_| ())).map_err(err)?;
            Ok(to_rel(&base, &dst))
        })
        .collect()
}

/// Deletes files the store no longer references (replaced icons, old packages…).
#[tauri::command]
pub fn remove_files(app: AppHandle, paths: Vec<String>) -> CmdResult<()> {
    let base = data_dir(&app)?;
    for rel in paths.iter().filter(|p| !p.is_empty()) {
        if let Ok(p) = resolve(&base, rel) {
            if p.is_file() {
                let _ = fs::remove_file(p);
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Commands: installing and launching
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    dir: String,
    launch_path: String,
}

/// Installs a package. A zip is extracted into `installed/<app_id>/`. An exe/msi is an
/// installer: it is run (the wizard appears), and once it is closed we look for the app it
/// installed so that "Ouvrir" starts the app itself and never the installer again.
/// `launch_path` is empty when the installed app could not be detected.
#[tauri::command]
pub async fn install_package(
    app: AppHandle,
    app_id: String,
    package_path: String,
    app_name: String,
    on_progress: Channel<Progress>,
) -> CmdResult<InstallResult> {
    let id = safe_id(&app_id)?;
    let base = data_dir(&app)?;
    let src = resolve(&base, &package_path)?;
    blocking(move || {
        if !src.is_file() {
            return Err("Le fichier de l'application est introuvable dans la bibliothèque".into());
        }
        let target = base.join("installed").join(&id);
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|e| format!("Impossible de remplacer l'installation (l'app est-elle ouverte ?) : {e}"))?;
        }

        if ext_of(&src) != "zip" {
            return install_with_installer(&src, &app_name, &on_progress);
        }

        fs::create_dir_all(&target).map_err(err)?;
        match extract_zip(&src, &target, &on_progress) {
            Ok(()) => {
                let launch = find_launcher(&target, &app_name).unwrap_or_else(|| target.clone());
                Ok(InstallResult { dir: to_rel(&base, &target), launch_path: to_rel(&base, &launch) })
            }
            Err(e) => {
                let _ = fs::remove_dir_all(&target);
                Err(e)
            }
        }
    })
    .await
}

fn install_with_installer(src: &Path, app_name: &str, channel: &Channel<Progress>) -> CmdResult<InstallResult> {
    let before = Snapshot::take();
    // total = 0 tells the UI the duration is unknown ("Installation…").
    let _ = channel.send(Progress { done: 0, total: 0 });
    run_and_wait(src)?;

    // Installers register themselves a moment after closing, and bootstrappers hand over to a
    // background process: keep looking for a while, with every signal we have.
    let mut resolved = HashMap::new();
    let mut launch = None;
    for attempt in 0..15 {
        // Also by exact name: a reinstall leaves nothing "new" to spot.
        launch = detect_new(&before, app_name, &mut resolved)
            .or_else(|| detect_by_names(&[app_name.to_string()]).pop().flatten());
        if launch.is_some() {
            break;
        }
        if attempt < 14 {
            std::thread::sleep(Duration::from_secs(1));
        }
    }
    // Reinstalling over an existing install changes nothing new on the PC: fall back to the name.
    let launch = launch.or_else(|| detect_by_names(&[app_name.to_string()]).pop().flatten());
    Ok(InstallResult { dir: String::new(), launch_path: launch.map(|p| p.to_string_lossy().into_owned()).unwrap_or_default() })
}

/// What the PC looked like before the installer ran, to spot what it added.
struct Snapshot {
    uninstall: HashSet<String>,
    shortcuts: HashSet<PathBuf>,
    folders: HashSet<PathBuf>,
}

impl Snapshot {
    fn take() -> Self {
        Self {
            uninstall: uninstall_entries().into_iter().map(|e| e.key).collect(),
            shortcuts: shortcut_files().into_iter().collect(),
            folders: install_folders(),
        }
    }
}

#[derive(Clone)]
struct UninstallEntry {
    key: String,
    name: String,
    location: String,
    icon: String,
    uninstall: String,
}

fn env_path(var: &str) -> Option<PathBuf> {
    std::env::var_os(var).filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn collect_lnks(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_lnks(&p, depth + 1, out);
        } else if ext_of(&p) == "lnk" {
            out.push(p);
        }
    }
}

/// Start menu and desktop shortcuts: nearly every installer adds one for the app.
fn shortcut_files() -> Vec<PathBuf> {
    let menu = r"Microsoft\Windows\Start Menu\Programs";
    let mut roots = Vec::new();
    roots.extend(env_path("ProgramData").map(|p| p.join(menu)));
    roots.extend(env_path("APPDATA").map(|p| p.join(menu)));
    for var in ["USERPROFILE", "OneDrive", "PUBLIC"] {
        roots.extend(env_path(var).map(|p| p.join("Desktop")));
    }
    let mut out = Vec::new();
    for root in roots {
        collect_lnks(&root, 0, &mut out);
    }
    out
}

/// Folders where installers usually put the app (only the first level is listed).
fn install_folders() -> HashSet<PathBuf> {
    let mut roots = Vec::new();
    roots.extend(env_path("ProgramFiles"));
    roots.extend(env_path("ProgramFiles(x86)"));
    roots.extend(env_path("LOCALAPPDATA").map(|p| p.join("Programs")));
    roots.extend(env_path("LOCALAPPDATA"));
    roots.extend(env_path("APPDATA"));
    let mut out = HashSet::new();
    for root in roots {
        let Ok(entries) = fs::read_dir(&root) else { continue };
        out.extend(entries.flatten().map(|e| e.path()).filter(|p| p.is_dir()));
    }
    out
}

/// Target of each `.lnk`, read through the Windows shell (one PowerShell call for all of them).
#[cfg(windows)]
fn resolve_shortcuts(lnks: &[PathBuf]) -> Vec<(PathBuf, PathBuf)> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    if lnks.is_empty() {
        return Vec::new();
    }
    let list = lnks.iter().map(|p| format!("'{}'", p.to_string_lossy().replace('\'', "''"))).collect::<Vec<_>>().join(",");
    let script = format!(
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8;$s=New-Object -ComObject WScript.Shell;\
         foreach($l in @({list})){{try{{Write-Output ($l+'|'+$s.CreateShortcut($l).TargetPath)}}catch{{}}}}"
    );
    // CREATE_NO_WINDOW: no console flash.
    let Ok(out) = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script]).creation_flags(0x0800_0000).output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|line| line.trim_start_matches('\u{feff}').rsplit_once('|'))
        .filter(|(_, target)| !target.trim().is_empty())
        .map(|(lnk, target)| (PathBuf::from(lnk), PathBuf::from(target.trim())))
        .collect()
}

#[cfg(not(windows))]
fn resolve_shortcuts(_: &[PathBuf]) -> Vec<(PathBuf, PathBuf)> {
    Vec::new()
}

/// An executable worth launching: it exists, isn't an uninstaller/helper, isn't part of Windows.
fn is_app_exe(p: &Path) -> bool {
    let in_windows = env_path("windir").is_some_and(|w| p.starts_with(w));
    ext_of(p) == "exe" && p.is_file() && !in_windows && is_launcher_name(&name_of(p))
}

/// Whether a path (its file or one of its three parent folders) looks like it belongs to the app.
fn path_matches(p: &Path, wanted: &str) -> bool {
    let wanted = &base_name(wanted);
    if wanted.len() < 3 {
        return false;
    }
    p.ancestors().take(3).filter_map(|a| a.file_stem().and_then(OsStr::to_str)).any(|s| {
        // Exact name only: "nexora-chat" must never pass for "nexora".
        base_name(s) == *wanted
    })
}

/// Best candidate: the one named like the app, else (when allowed) the first.
fn pick(mut candidates: Vec<PathBuf>, app_name: &str, accept_any: bool) -> Option<PathBuf> {
    let wanted = normalize(app_name);
    if let Some(i) = candidates.iter().position(|p| path_matches(p, &wanted)) {
        return Some(candidates.swap_remove(i));
    }
    if accept_any && !candidates.is_empty() { Some(candidates.swap_remove(0)) } else { None }
}

/// Looks for what an installer just added: registry entries, then shortcuts, then new folders.
fn detect_new(before: &Snapshot, app_name: &str, resolved: &mut HashMap<PathBuf, PathBuf>) -> Option<PathBuf> {
    let fresh: Vec<UninstallEntry> = uninstall_entries().into_iter().filter(|e| !before.uninstall.contains(&e.key)).collect();
    // Other things can install in the background meanwhile (updaters, runtimes): only trust
    // an entry that is named like the app, or the only new one.
    let wanted = normalize(app_name);
    let (named, others): (Vec<_>, Vec<_>) = fresh.into_iter().partition(|e| {
        names_match(&e.name, app_name)
            || path_matches(Path::new(e.location.trim().trim_matches('"')), &wanted)
            || path_matches(Path::new(e.icon.trim().trim_matches('"')), &wanted)
    });
    if let Some(p) = launcher_from(&named, app_name) {
        return Some(p);
    }
    if named.is_empty() && others.len() == 1 {
        if let Some(p) = launcher_from(&others, app_name) {
            return Some(p);
        }
    }

    let new_lnks: Vec<PathBuf> = shortcut_files().into_iter().filter(|p| !before.shortcuts.contains(p)).collect();
    let todo: Vec<PathBuf> = new_lnks.iter().filter(|p| !resolved.contains_key(*p)).cloned().collect();
    resolved.extend(resolve_shortcuts(&todo));
    for lnk in todo {
        resolved.entry(lnk).or_default(); // unreadable: don't try again
    }
    let targets: Vec<PathBuf> = new_lnks.iter().filter_map(|l| resolved.get(l)).filter(|t| is_app_exe(t)).cloned().collect();
    let only_target = targets.len() == 1;
    if let Some(p) = pick(targets, app_name, only_target) {
        return Some(p);
    }

    let launchers: Vec<PathBuf> = install_folders()
        .into_iter()
        .filter(|d| !before.folders.contains(d))
        .filter_map(|d| find_launcher(&d, app_name))
        .filter(|p| is_launcher_name(&name_of(p)))
        .collect();
    let only_one = launchers.len() == 1;
    pick(launchers, app_name, only_one)
}

/// Does an installed-programs name ("Nexora Game 1.2.3") designate this store app?
fn names_match(installed: &str, app_name: &str) -> bool {
    let app = base_name(app_name);
    app.len() >= 3 && base_name(installed) == app
}

/// Lowercase letters and digits only, without a trailing version number ("Nexora 1.2" → "nexora").
fn base_name(s: &str) -> String {
    normalize(s).trim_end_matches(|c: char| c.is_ascii_digit()).to_string()
}

/// For each name, the executable of an app already on the PC (installed earlier, by the store
/// or not): matched on the "Apps installed" list, then on start menu / desktop shortcuts.
fn detect_by_names(names: &[String]) -> Vec<Option<PathBuf>> {
    let entries = uninstall_entries();
    let lnks = shortcut_files();
    let mut resolved: HashMap<PathBuf, PathBuf> = HashMap::new();
    names
        .iter()
        .map(|name| {
            let own: Vec<UninstallEntry> = entries
                .iter()
                .filter(|e| names_match(&e.name, name))
                .cloned()
                .collect();
            if let Some(p) = launcher_from(&own, name) {
                return Some(p);
            }
            let matching: Vec<PathBuf> = lnks
                .iter()
                .filter(|l| l.file_stem().and_then(OsStr::to_str).is_some_and(|s| names_match(s, name)))
                .cloned()
                .collect();
            let todo: Vec<PathBuf> = matching.iter().filter(|p| !resolved.contains_key(*p)).cloned().collect();
            resolved.extend(resolve_shortcuts(&todo));
            let targets: Vec<PathBuf> = matching.iter().filter_map(|l| resolved.get(l)).filter(|t| is_app_exe(t)).cloned().collect();
            targets.into_iter().next()
        })
        .collect()
}

/// Detects apps that are already installed on this PC, by store app name.
/// Returns one launch path per name ("" when nothing was found).
#[tauri::command]
pub async fn detect_installed(names: Vec<String>) -> CmdResult<Vec<String>> {
    blocking(move || {
        Ok(detect_by_names(&names).into_iter().map(|p| p.map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()).collect())
    })
    .await
}

/// Programs registered in Windows' "Apps installed" list.
#[cfg(windows)]
fn uninstall_entries() -> Vec<UninstallEntry> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const ROOT: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    const ROOT_32: &str = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";
    let mut out = Vec::new();
    for (hive_id, hive, path) in [(0, HKEY_LOCAL_MACHINE, ROOT), (1, HKEY_LOCAL_MACHINE, ROOT_32), (2, HKEY_CURRENT_USER, ROOT)] {
        let Ok(root) = RegKey::predef(hive).open_subkey(path) else { continue };
        for name in root.enum_keys().flatten() {
            let Ok(sub) = root.open_subkey(&name) else { continue };
            let get = |value: &str| sub.get_value::<String, _>(value).unwrap_or_default();
            out.push(UninstallEntry {
                key: format!("{hive_id}\\{name}"),
                name: get("DisplayName"),
                location: get("InstallLocation"),
                icon: get("DisplayIcon"),
                uninstall: get("UninstallString"),
            });
        }
    }
    out
}

#[cfg(not(windows))]
fn uninstall_entries() -> Vec<UninstallEntry> {
    Vec::new()
}

fn is_launcher_name(stem: &str) -> bool {
    let stem = normalize(stem);
    !NOT_LAUNCHERS.iter().any(|bad| stem.contains(bad))
}

/// The app's executable, from what its installer registered: its install folder first,
/// then the icon path (usually the main exe).
fn launcher_from(entries: &[UninstallEntry], app_name: &str) -> Option<PathBuf> {
    for e in entries {
        let dir = PathBuf::from(e.location.trim().trim_matches('"'));
        if !e.location.trim().is_empty() && dir.is_dir() {
            if let Some(p) = find_launcher(&dir, app_name).filter(|p| is_launcher_name(&name_of(p))) {
                return Some(p);
            }
        }
        let icon = e.icon.trim();
        let icon = match icon.rsplit_once(',') {
            Some((path, idx)) if idx.trim().parse::<i32>().is_ok() => path,
            _ => icon,
        };
        let p = PathBuf::from(icon.trim().trim_matches('"'));
        if ext_of(&p) == "exe" && p.is_file() && is_launcher_name(&name_of(&p)) {
            return Some(p);
        }
    }
    None
}

/// Runs a file through the shell (so UAC prompts work) and waits until its process ends.
fn run_and_wait(p: &Path) -> CmdResult<()> {
    run_and_wait_args(p, None)
}

#[cfg(windows)]
fn run_and_wait_args(p: &Path, params: Option<&str>) -> CmdResult<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{WaitForSingleObject, INFINITE};
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &OsStr) -> Vec<u16> {
        s.encode_wide().chain(Some(0)).collect()
    }
    let verb = wide(OsStr::new("open"));
    let file = wide(p.as_os_str());
    let parent = p.parent().filter(|d| !d.as_os_str().is_empty());
    let dir = parent.map(|d| wide(d.as_os_str()));
    let args = params.filter(|a| !a.is_empty()).map(|a| wide(OsStr::new(a)));

    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS;
    info.lpVerb = verb.as_ptr();
    info.lpFile = file.as_ptr();
    info.lpParameters = args.as_ref().map_or(std::ptr::null(), |a| a.as_ptr());
    info.lpDirectory = dir.as_ref().map_or(std::ptr::null(), |d| d.as_ptr());
    info.nShow = SW_SHOWNORMAL;

    if unsafe { ShellExecuteExW(&mut info) } == 0 {
        return Err("Impossible de lancer l'installateur (autorisation refusée ?)".into());
    }
    if !info.hProcess.is_null() {
        unsafe {
            WaitForSingleObject(info.hProcess, INFINITE);
            CloseHandle(info.hProcess);
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn run_and_wait_args(p: &Path, _params: Option<&str>) -> CmdResult<()> {
    tauri_plugin_opener::open_path(p, None::<&str>).map_err(err)
}

/// Splits a registry command line (`"C:\x\unins000.exe" /SILENT`, `MsiExec.exe /X{...}`)
/// into the program and its arguments, expanding `%VARS%`.
fn parse_command(cmd: &str) -> Option<(String, String)> {
    let cmd = expand_env(cmd.trim());
    if let Some(rest) = cmd.strip_prefix('"') {
        let (file, args) = rest.split_once('"')?;
        return Some((file.to_string(), args.trim().to_string()));
    }
    let end = cmd.to_ascii_lowercase().find(".exe")? + 4;
    Some((cmd[..end].to_string(), cmd[end..].trim().to_string()))
}

fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let Some(j) = after.find('%') else {
            out.push('%');
            rest = after;
            break;
        };
        match std::env::var(&after[..j]) {
            Ok(v) => out.push_str(&v),
            Err(_) => out.push_str(&rest[i..i + j + 2]),
        }
        rest = &after[j + 1..];
    }
    out.push_str(rest);
    out
}

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().replace('/', "\\").eq_ignore_ascii_case(&b.to_string_lossy().replace('/', "\\"))
}

/// The "Apps installed" entry of an app: by its icon/install folder (precise), then by name.
fn find_entry<'a>(entries: &'a [UninstallEntry], app_name: &str, launch: Option<&Path>) -> Option<&'a UninstallEntry> {
    let usable = |e: &&UninstallEntry| !e.uninstall.trim().is_empty();
    let by_path = launch.and_then(|l| {
        entries.iter().filter(usable).find(|e| {
            let icon = e.icon.trim();
            let icon = icon.rsplit_once(',').filter(|(_, i)| i.trim().parse::<i32>().is_ok()).map_or(icon, |(p, _)| p);
            let loc = e.location.trim().trim_matches('"');
            same_path(Path::new(icon.trim().trim_matches('"')), l) || (!loc.is_empty() && l.starts_with(loc))
        })
    });
    by_path.or_else(|| entries.iter().filter(usable).find(|e| names_match(&e.name, app_name)))
}

/// Uninstalls an app the way Windows Settings does: runs the uninstaller its installer
/// registered. Returns "done", "cancelled" (still installed) or "notfound" (nothing registered).
#[tauri::command]
pub async fn system_uninstall(app: AppHandle, app_name: String, launch_path: String) -> CmdResult<String> {
    let base = data_dir(&app)?;
    blocking(move || {
        let launch = if launch_path.is_empty() { None } else { Some(resolve_any(&base, &launch_path)?) };
        let entries = uninstall_entries();
        let Some(entry) = find_entry(&entries, &app_name, launch.as_deref()) else { return Ok("notfound".into()) };
        let Some((file, args)) = parse_command(&entry.uninstall) else { return Ok("notfound".into()) };
        let key = entry.key.clone();

        let started = Instant::now();
        run_and_wait_args(Path::new(&file), Some(&args))?;
        // An uninstaller that returns at once handed over to a copy of itself: wait longer.
        let patience = if started.elapsed() < Duration::from_secs(3) { 180 } else { 6 };
        for _ in 0..patience {
            let registered = uninstall_entries().iter().any(|e| e.key == key);
            let gone = launch.as_deref().is_some_and(|l| !l.exists());
            if !registered || gone {
                return Ok("done".into());
            }
            std::thread::sleep(Duration::from_secs(1));
        }
        Ok("cancelled".into())
    })
    .await
}

fn extract_zip(src: &Path, target: &Path, channel: &Channel<Progress>) -> CmdResult<()> {
    let file = File::open(src).map_err(err)?;
    let mut archive = zip::ZipArchive::new(BufReader::new(file)).map_err(|e| format!("Archive zip illisible : {e}"))?;

    let mut total = 0u64;
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index_raw(i) {
            total += entry.size();
        }
    }

    let mut rep = Reporter::new(channel, total);
    let mut buf = vec![0u8; 1 << 20];
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(err)?;
        // `enclosed_name` drops entries that would escape the target folder ("../").
        let Some(rel) = entry.enclosed_name() else { continue };
        let out = target.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(err)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        let mut file = File::create(&out).map_err(err)?;
        stream(&mut entry, &mut file, &mut rep, &mut buf).map_err(err)?;
    }
    rep.finish();
    Ok(())
}

fn normalize(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase()
}

fn collect_exes(dir: &Path, depth: usize, out: &mut Vec<(PathBuf, usize)>) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            collect_exes(&p, depth + 1, out);
        } else if ext_of(&p) == "exe" {
            out.push((p, depth));
        }
    }
}

/// Picks the executable to launch in an extracted zip: shallowest first,
/// skipping uninstallers/crash handlers, preferring one named like the app.
fn find_launcher(dir: &Path, app_name: &str) -> Option<PathBuf> {
    let mut exes = Vec::new();
    collect_exes(dir, 0, &mut exes);
    let wanted = normalize(app_name);
    exes.into_iter()
        .min_by_key(|(p, depth)| {
            let stem = normalize(p.file_stem().and_then(OsStr::to_str).unwrap_or(""));
            let mut score = *depth as i32 * 10;
            if NOT_LAUNCHERS.iter().any(|bad| stem.contains(bad)) {
                score += 100;
            }
            if !wanted.is_empty() && !stem.is_empty() && (stem.contains(&wanted) || wanted.contains(&stem)) {
                score -= 5;
            }
            score
        })
        .map(|(p, _)| p)
}

/// Launches an installed app (or opens its folder when no executable was found).
#[tauri::command]
pub async fn launch_path(app: AppHandle, path: String) -> CmdResult<()> {
    let base = data_dir(&app)?;
    let p = resolve_any(&base, &path)?;
    blocking(move || {
        if !p.exists() {
            return Err("Fichier introuvable : réinstalle l'application".into());
        }
        if p.is_dir() {
            return tauri_plugin_opener::open_path(&p, None::<&str>).map_err(err);
        }
        shell_open(&p)
    })
    .await
}

/// ShellExecute handles UAC prompts for installers and runs the app from its own folder,
/// which many games need to find their data files.
#[cfg(windows)]
fn shell_open(p: &Path) -> CmdResult<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &OsStr) -> Vec<u16> {
        s.encode_wide().chain(Some(0)).collect()
    }
    let verb = wide(OsStr::new("open"));
    let file = wide(p.as_os_str());
    let dir = wide(p.parent().unwrap_or(p).as_os_str());
    let code = unsafe {
        ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), file.as_ptr(), std::ptr::null(), dir.as_ptr(), SW_SHOWNORMAL)
    } as isize;
    if code > 32 { Ok(()) } else { Err(format!("Impossible de lancer l'application (code {code})")) }
}

#[cfg(not(windows))]
fn shell_open(p: &Path) -> CmdResult<()> {
    tauri_plugin_opener::open_path(p, None::<&str>).map_err(err)
}

/// Shows a file in Explorer, or opens a folder. An empty path opens the data folder.
#[tauri::command]
pub async fn reveal(app: AppHandle, path: String) -> CmdResult<()> {
    let base = data_dir(&app)?;
    let p = if path.is_empty() { base } else { resolve_any(&base, &path)? };
    blocking(move || {
        if p.is_dir() {
            tauri_plugin_opener::open_path(&p, None::<&str>).map_err(err)
        } else {
            tauri_plugin_opener::reveal_item_in_dir(&p).map_err(err)
        }
    })
    .await
}

#[tauri::command]
pub async fn uninstall(app: AppHandle, app_id: String) -> CmdResult<()> {
    let id = safe_id(&app_id)?;
    let target = data_dir(&app)?.join("installed").join(id);
    blocking(move || {
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|e| format!("Désinstallation impossible (l'app est-elle ouverte ?) : {e}"))?;
        }
        Ok(())
    })
    .await
}

/// Removes everything stored for an app: its library files and its installation.
#[tauri::command]
pub async fn delete_app_files(app: AppHandle, app_id: String) -> CmdResult<()> {
    let id = safe_id(&app_id)?;
    let base = data_dir(&app)?;
    blocking(move || {
        for dir in [base.join("installed").join(&id), base.join("library").join(&id)] {
            if dir.exists() {
                fs::remove_dir_all(&dir).map_err(err)?;
            }
        }
        Ok(())
    })
    .await
}
