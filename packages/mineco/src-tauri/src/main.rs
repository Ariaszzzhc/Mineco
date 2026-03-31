// Keep windows_subsystem = "windows" for desktop mode (hides console window).
// In CLI mode, we reattach to the parent console via AttachConsole.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "mineco", about = "Mineco - AI coding agent")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start web server mode (serves UI in browser)
    Web {
        /// Host to bind to
        #[arg(long, default_value = "127.0.0.1")]
        host: String,

        /// Port to listen on (0 for random)
        #[arg(long, default_value_t = 3000)]
        port: u16,

        /// Skip opening browser automatically
        #[arg(long)]
        no_open: bool,
    },

    /// Register mineco in system PATH
    InstallCli,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        None => {
            // Desktop mode: launch Tauri GUI
            app_lib::run();
        }
        Some(cmd) => {
            // CLI mode: reattach to parent console on Windows
            #[cfg(windows)]
            unsafe {
                windows_sys::Win32::System::Console::AttachConsole(u32::MAX);
            }

            match cmd {
                Commands::Web {
                    host,
                    port,
                    no_open,
                } => {
                    app_lib::run_web(host, port, no_open);
                }
                Commands::InstallCli => {
                    app_lib::install_cli();
                }
            }
        }
    }
}
