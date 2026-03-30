use std::net::TcpListener;
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

struct SidecarState {
    port: u16,
    child: Option<tauri_plugin_shell::process::CommandChild>,
}

fn find_available_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0")
        .expect("Failed to find available port");
    listener.local_addr().unwrap().port()
}

fn is_port_ready(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if cfg!(debug_assertions) {
                // Dev mode: core runs separately, Vite proxy handles API.
                // Create a plain window pointing at devUrl.
                WebviewWindowBuilder::new(
                    app,
                    "main",
                    WebviewUrl::External("http://localhost:5173".parse().unwrap()),
                )
                .title("Mineco")
                .inner_size(800.0, 600.0)
                .resizable(true)
                .build()?;
            } else {
                // Production: spawn sidecar, inject URL into webview via init script
                let port = find_available_port();
                app.manage(Mutex::new(SidecarState {
                    port,
                    child: None,
                }));

                let init_script = format!(
                    "Object.defineProperty(window,'__MINECO_API_URL__',{{value:'http://localhost:{}',writable:false}});",
                    port
                );

                WebviewWindowBuilder::new(
                    app,
                    "main",
                    WebviewUrl::App("index.html".into()),
                )
                .title("Mineco")
                .inner_size(800.0, 600.0)
                .resizable(true)
                .initialization_script(&init_script)
                .build()?;

                let handle = app.handle().clone();

                let (rx, child) = app
                    .shell()
                    .sidecar("mineco-core")
                    .expect("failed to find sidecar binary")
                    .env("MINECO_PORT", port.to_string())
                    .spawn()
                    .expect("failed to spawn sidecar");

                {
                    let state = app.state::<Mutex<SidecarState>>();
                    let mut s = state.lock().unwrap();
                    s.child = Some(child);
                }

                // Health check
                tauri::async_runtime::spawn(async move {
                    for _ in 0..60 {
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        if is_port_ready(port) {
                            log::info!("Sidecar ready at http://localhost:{}", port);
                            let _ = handle.emit("sidecar-ready", format!("http://localhost:{}", port));
                            return;
                        }
                    }
                    log::error!("Sidecar failed to start within 30s");
                    let _ = handle.emit("sidecar-error", "Sidecar health check timed out");
                });

                // Monitor sidecar output
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    let mut rx = rx;
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                log::info!("[sidecar] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                log::error!("[sidecar] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Terminated(status) => {
                                log::warn!("[sidecar] exited: {:?}", status);
                            }
                            CommandEvent::Error(err) => {
                                log::error!("[sidecar] error: {}", err);
                            }
                            _ => {}
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
