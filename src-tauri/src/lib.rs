mod commands;
mod launcher;
mod pocketbase;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

const SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS apps (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  developer     TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'game',
  category      TEXT NOT NULL DEFAULT '',
  version       TEXT NOT NULL DEFAULT '1.0',
  package_path  TEXT NOT NULL DEFAULT '',
  package_name  TEXT NOT NULL DEFAULT '',
  package_size  INTEGER NOT NULL DEFAULT 0,
  package_type  TEXT NOT NULL DEFAULT 'exe',
  icon          TEXT NOT NULL DEFAULT '',
  screenshots   TEXT NOT NULL DEFAULT '[]',
  featured      INTEGER NOT NULL DEFAULT 0,
  created       TEXT NOT NULL,
  updated       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS installs (
  app_id        TEXT PRIMARY KEY,
  version       TEXT NOT NULL,
  dir           TEXT NOT NULL,
  launch_path   TEXT NOT NULL,
  installed_at  TEXT NOT NULL
);
"#;

const SCHEMA_V2: &str = "ALTER TABLE apps ADD COLUMN self_update INTEGER NOT NULL DEFAULT 0;";

const SCHEMA_V3: &str = "DROP TABLE IF EXISTS apps;";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--restore-shortcuts") {
        launcher::restore_all();
        return;
    }
    let launch_request = launcher::parse(&args);

    let migrations = vec![
        Migration {
            version: 1,
            description: "create_tables",
            sql: SCHEMA_V1,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_self_update",
            sql: SCHEMA_V2,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "catalog_moved_to_pocketbase",
            sql: SCHEMA_V3,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        // Must stay first: a second start hands over before anything else is initialised.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            launcher::on_second_instance(app, &argv);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:nexora.db", migrations)
                .build(),
        )
        .setup(move |app| {
            // Images picked in a form that was never saved end up here: start clean.
            if let Ok(dir) = app.path().app_data_dir() {
                let _ = std::fs::remove_dir_all(dir.join("staging"));
            }
            // Started from a desktop shortcut: only the small update window opens.
            match &launch_request {
                Some(request) => launcher::open_window(app.handle(), request)?,
                None => launcher::show_main(app.handle())?,
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::file_info,
            commands::stage_image,
            pocketbase::pb_save,
            pocketbase::download_package,
            commands::remove_files,
            commands::install_package,
            commands::detect_installed,
            commands::launch_path,
            commands::reveal,
            commands::uninstall,
            commands::system_uninstall,
            commands::delete_app_files,
            launcher::sync_shortcuts,
            launcher::app_in_use,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
