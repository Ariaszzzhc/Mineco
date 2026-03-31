use std::net::TcpListener;
use std::sync::Mutex;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::ShellExt;

struct SidecarState {
    #[allow(dead_code)]
    port: u16,
    child: Option<tauri_plugin_shell::process::CommandChild>,
}

fn find_available_port() -> u16 {
    let listener =
        TcpListener::bind("127.0.0.1:0").expect("Failed to find available port");
    listener.local_addr().unwrap().port()
}

fn is_port_ready(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

/// Find the sidecar binary next to the main executable.
fn find_sidecar_binary(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let name = if cfg!(windows) {
        "mineco-core.exe"
    } else {
        "mineco-core"
    };
    let path = dir.join(name);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

/// Resolve the SPA resources directory relative to the executable.
fn resolve_spa_dir() -> Option<std::path::PathBuf> {
    let exe_dir = std::env::current_exe()
        .ok()?
        .parent()?
        .to_path_buf();

    let spa_dir = if cfg!(target_os = "macos") {
        // macOS .app bundle: Contents/MacOS/mineco -> Contents/Resources/web/
        exe_dir.join("../Resources/web")
    } else {
        // Windows/Linux: mineco.exe sits alongside resources/
        exe_dir.join("resources/web")
    };

    if spa_dir.exists() {
        Some(spa_dir)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Desktop mode (Tauri GUI)
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<Mutex<SidecarState>>() {
                    if let Ok(mut s) = state.lock() {
                        if let Some(child) = s.child.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}

pub fn run_web(host: String, port: u16, no_open: bool) {
    use rand::Rng;
    use std::process::{Command, Stdio};

    // Generate auth token
    let token: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(48)
        .map(char::from)
        .collect();

    // Resolve SPA directory
    let spa_dir = resolve_spa_dir().unwrap_or_else(|| {
        eprintln!("Error: SPA assets not found in resources/web/");
        eprintln!("This binary may not have been built with web mode support.");
        std::process::exit(1);
    });

    // Locate sidecar binary
    let exe_dir = std::env::current_exe()
        .expect("cannot resolve executable path")
        .parent()
        .expect("no parent directory")
        .to_path_buf();

    let sidecar_path = find_sidecar_binary(&exe_dir).unwrap_or_else(|| {
        eprintln!("Error: Cannot find mineco-core sidecar binary");
        std::process::exit(1);
    });

    // Print startup banner
    let url = format!("http://{}:{}", host, port);
    println!();
    println!("  Mineco is running at:");
    println!();
    println!("  \u{27a4} Local:   {}/?token={}", url, token);
    if host == "0.0.0.0" {
        if let Some(ip) = get_local_ip() {
            println!("  \u{27a4} Network: http://{}:{}/?token={}", ip, port, token);
        }
    }
    println!();
    println!("  Token: {}", token);
    println!();
    println!("  Press Ctrl+C to stop");
    println!();

    // Spawn sidecar as a foreground child process
    let mut child = Command::new(&sidecar_path)
        .env("MINECO_PORT", port.to_string())
        .env("MINECO_HOST", &host)
        .env("MINECO_AUTH_TOKEN", &token)
        .env("MINECO_SPA_DIR", spa_dir.to_string_lossy().to_string())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap_or_else(|e| {
            eprintln!("Failed to spawn mineco-core: {}", e);
            std::process::exit(1);
        });

    // Open browser
    if !no_open {
        let open_url = format!("{}/?token={}", url, token);
        let _ = open::that(&open_url);
    }

    // Wait for child to exit (blocks main thread)
    let status = child.wait().unwrap_or_else(|e| {
        eprintln!("Failed to wait for sidecar: {}", e);
        std::process::exit(1);
    });
    std::process::exit(status.code().unwrap_or(1));
}

/// Get a non-loopback local IP address for display purposes.
fn get_local_ip() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

// ---------------------------------------------------------------------------
// install-cli: register mineco in system PATH
// ---------------------------------------------------------------------------

pub fn install_cli() {
    let exe_path = std::env::current_exe().expect("Cannot determine executable path");

    #[cfg(target_os = "windows")]
    install_cli_windows(&exe_path);

    #[cfg(target_os = "macos")]
    install_cli_unix(&exe_path);

    #[cfg(target_os = "linux")]
    install_cli_unix(&exe_path);
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn install_cli_unix(exe_path: &std::path::Path) {
    let link_path = std::path::Path::new("/usr/local/bin/mineco");

    if link_path.exists() {
        if let Err(e) = std::fs::remove_file(link_path) {
            eprintln!("Failed to remove existing symlink: {}", e);
            eprintln!("Try running with sudo.");
            std::process::exit(1);
        }
    }

    match std::os::unix::fs::symlink(exe_path, link_path) {
        Ok(_) => {
            println!(
                "Installed: {} -> {}",
                link_path.display(),
                exe_path.display()
            );
        }
        Err(e) => {
            eprintln!("Failed to create symlink: {}", e);
            eprintln!("Try running with sudo.");
            std::process::exit(1);
        }
    }
}

#[cfg(target_os = "windows")]
fn install_cli_windows(exe_path: &std::path::Path) {
    let exe_dir = exe_path
        .parent()
        .expect("no parent directory")
        .to_string_lossy()
        .to_string();

    // Read current user PATH from registry
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let env = hkcu
        .open_subkey_with_flags("Environment", winreg::enums::KEY_READ | winreg::enums::KEY_WRITE)
        .expect("Failed to open Environment registry key");

    let current_path: String = env.get_value("Path").unwrap_or_default();

    // Check if already in PATH
    let paths: Vec<&str> = current_path.split(';').collect();
    if paths.iter().any(|p| p.eq_ignore_ascii_case(&exe_dir)) {
        println!("mineco is already in PATH: {}", exe_dir);
        return;
    }

    // Append to PATH
    let new_path = if current_path.is_empty() {
        exe_dir.clone()
    } else {
        format!("{};{}", current_path, exe_dir)
    };

    env.set_value("Path", &new_path)
        .expect("Failed to update PATH registry");

    // Broadcast WM_SETTINGCHANGE so running shells pick up the change
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::SendMessageTimeoutW(
            0xFFFF as _, // HWND_BROADCAST
            0x001A,      // WM_SETTINGCHANGE
            0,
            "Environment\0".encode_utf16().collect::<Vec<u16>>().as_ptr() as _,
            0x0002, // SMTO_ABORTIFHUNG
            5000,
            std::ptr::null_mut(),
        );
    }

    println!("Added {} to user PATH", exe_dir);
    println!("Restart your terminal for the change to take effect.");
}
