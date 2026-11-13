#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod database;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct DesktopServer(Mutex<Option<zenoh_admin::RunningServer>>);

fn main() {
    let server = Arc::new(DesktopServer::default());
    let setup_server = server.clone();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            if let Err(error) = start(app, setup_server.clone()) {
                let running = setup_server.0.lock().unwrap().take();
                if let Some(running) = running {
                    tauri::async_runtime::block_on(running.shutdown());
                }
                app.dialog()
                    .message(format!(
                        "Topicwake could not start.\n\n{error}\n\nQuit the app and try again."
                    ))
                    .title("Topicwake")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                    .show({
                        let handle = app.handle().clone();
                        move |_| handle.exit(1)
                    });
                return Ok(());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to initialize Topicwake");
    app.run(move |app, event| {
        if let tauri::RunEvent::Exit = event {
            // The webview is no longer usable before its owned loopback server releases its port.
            let running = server.0.lock().unwrap().take();
            if let Some(running) = running {
                tauri::async_runtime::block_on(running.shutdown());
            }
        }
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}

fn start(
    app: &mut tauri::App,
    server: Arc<DesktopServer>,
) -> Result<(), Box<dyn std::error::Error>> {
    let directory = match std::env::var_os("ZENOH_ADMIN_DATA_DIR") {
        Some(path) => PathBuf::from(path),
        None => app.path().app_data_dir()?,
    };
    let source = std::env::var_os("ZENOH_ADMIN_IMPORT_DB").map(PathBuf::from);
    let database = database::prepare_database(&directory, source.as_deref())?;
    let frontend = app.path().resource_dir()?.join("frontend");
    let running = tauri::async_runtime::block_on(async {
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
        zenoh_admin::start_server(listener, &database, &frontend).await
    })
    .map_err(|e| -> Box<dyn std::error::Error> { e })?;
    let origin = format!("http://{}", running.address);
    let url = format!("{origin}/?desktop=1").parse()?;
    *server.0.lock().unwrap() = Some(running);
    let allowed_origin = origin.clone();
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("Topicwake")
        .inner_size(1280.0, 800.0)
        .min_inner_size(760.0, 560.0)
        .on_navigation(move |url| url.origin().ascii_serialization() == allowed_origin)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()?;
    let handle = app.handle().clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            handle.exit(0);
        }
    });
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let finished = server
                .0
                .lock()
                .unwrap()
                .as_ref()
                .is_some_and(|running| running.is_finished());
            if finished {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.destroy();
                }
                handle.exit(1);
                break;
            }
        }
    });
    Ok(())
}
