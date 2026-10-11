// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    match lifeos_lib::handle_walk_reminder_cli(&std::env::args().skip(1).collect::<Vec<_>>()) {
        Ok(true) => return,
        Err(error) => { eprintln!("{error}"); std::process::exit(1); },
        Ok(false) => {},
    }
    lifeos_lib::run();
}
