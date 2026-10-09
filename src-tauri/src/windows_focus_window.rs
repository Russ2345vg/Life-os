use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

#[derive(Clone, Copy, PartialEq)]
enum Mode { Normal, Entering, Compact, Restoring }

#[derive(Clone)]
struct RestoreState {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    decorated: bool,
    resizable: bool,
    topmost: bool,
    maximized: bool,
    fullscreen: bool,
}

struct Controller {
    active: bool,
    mode: Mode,
    restore: Option<RestoreState>,
}

pub struct FocusWindowState(Mutex<Controller>);
impl Default for FocusWindowState {
    fn default() -> Self { Self(Mutex::new(Controller { active: false, mode: Mode::Normal, restore: None })) }
}

#[derive(Clone, serde::Serialize)]
struct ModeEvent { compact: bool, error: Option<String> }
fn emit(window: &WebviewWindow, compact: bool, error: Option<String>) {
    let _ = window.emit("lifeos-focus-window", ModeEvent { compact, error });
}
fn own_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) } else { Err("Окно фокуса доступно только в LifeOS.".into()) }
}

pub fn cache_normal(window: &WebviewWindow) -> Result<(), String> {
    let state = window.state::<FocusWindowState>();
    if state.0.lock().map_err(|e| e.to_string())?.mode != Mode::Normal { return Ok(()); }
    if window.is_minimized().map_err(|e| e.to_string())? { return Ok(()); }
    let maximized = window.is_maximized().map_err(|e| e.to_string())?;
    let fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    if size.width == 0 || size.height == 0 || position.x <= -30000 || position.y <= -30000 { return Ok(()); }
    let decorated = window.is_decorated().map_err(|e| e.to_string())?;
    let resizable = window.is_resizable().map_err(|e| e.to_string())?;
    let topmost = window.is_always_on_top().map_err(|e| e.to_string())?;
    let mut controller = state.0.lock().map_err(|e| e.to_string())?;
    if controller.mode != Mode::Normal { return Ok(()); }
    let previous = controller.restore.as_ref();
    controller.restore = Some(RestoreState {
        position: if maximized || fullscreen { previous.map(|p| p.position).unwrap_or(position) } else { position },
        size: if maximized || fullscreen { previous.map(|p| p.size).unwrap_or(size) } else { size },
        decorated, resizable, topmost, maximized, fullscreen,
    });
    Ok(())
}

fn restore_geometry(window: &WebviewWindow, saved: &RestoreState) -> Result<(), String> {
    let config = window.app_handle().config().app.windows.iter().find(|w| w.label == "main").cloned();
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    window.unmaximize().map_err(|e| e.to_string())?;
    window.set_decorations(saved.decorated).map_err(|e| e.to_string())?;
    window.set_resizable(saved.resizable).map_err(|e| e.to_string())?;
    let minimum = config.as_ref().and_then(|c| c.min_width.zip(c.min_height)).map(|(w, h)| LogicalSize::new(w, h));
    let maximum = config.as_ref().and_then(|c| c.max_width.zip(c.max_height)).map(|(w, h)| LogicalSize::new(w, h));
    window.set_min_size(minimum).map_err(|e| e.to_string())?;
    window.set_max_size(maximum).map_err(|e| e.to_string())?;
    window.set_position(saved.position).map_err(|e| e.to_string())?;
    window.set_size(saved.size).map_err(|e| e.to_string())?;
    window.set_always_on_top(saved.topmost).map_err(|e| e.to_string())?;
    if saved.maximized { window.maximize().map_err(|e| e.to_string())?; }
    if saved.fullscreen { window.set_fullscreen(true).map_err(|e| e.to_string())?; }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn restore_now(window: &WebviewWindow) -> Result<(), String> {
    let state = window.state::<FocusWindowState>();
    let saved = state.0.lock().map_err(|e| e.to_string())?.restore.clone()
        .ok_or_else(|| "Не удалось восстановить размеры окна LifeOS.".to_string())?;
    let result = restore_geometry(window, &saved);
    let success = result.is_ok();
    state.0.lock().map_err(|e| e.to_string())?.mode = if success { Mode::Normal } else { Mode::Compact };
    emit(window, !success, result.as_ref().err().cloned());
    result
}

fn enter_now(window: &WebviewWindow) -> Result<(), String> {
    let state = window.state::<FocusWindowState>();
    {
        let mut controller = state.0.lock().map_err(|e| e.to_string())?;
        if controller.mode != Mode::Entering { return Ok(()); }
        if !controller.active { controller.mode = Mode::Normal; return Ok(()); }
    }
    let result = (|| {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.unmaximize().map_err(|e| e.to_string())?;
        window.set_min_size(Some(LogicalSize::new(340.0, 230.0))).map_err(|e| e.to_string())?;
        window.set_max_size(None::<LogicalSize<f64>>).map_err(|e| e.to_string())?;
        window.set_decorations(false).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())?;
        window.set_size(LogicalSize::new(340.0, 230.0)).map_err(|e| e.to_string())?;
        if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
            let scale = monitor.scale_factor();
            let position = PhysicalPosition::new(
                monitor.position().x + monitor.size().width as i32 - (364.0 * scale) as i32,
                monitor.position().y + monitor.size().height as i32 - (310.0 * scale) as i32,
            );
            window.set_position(position).map_err(|e| e.to_string())?;
        }
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        let _ = restore_now(window);
        let compact = state.0.lock().map_err(|e| e.to_string())?.mode == Mode::Compact;
        emit(window, compact, Some(format!("Не удалось открыть мини-таймер: {error}")));
        return Err(error);
    }
    state.0.lock().map_err(|e| e.to_string())?.mode = Mode::Compact;
    emit(window, true, None);
    Ok(())
}

fn request_compact(window: WebviewWindow) {
    let requested = {
        let state = window.state::<FocusWindowState>();
        let Ok(mut controller) = state.0.lock() else { return; };
        if !controller.active || controller.mode != Mode::Normal || controller.restore.is_none() { false }
        else { controller.mode = Mode::Entering; true }
    };
    if !requested { return; }
    tauri::async_runtime::spawn(async move {
        let target = window.clone();
        if let Err(error) = window.run_on_main_thread(move || { let _ = enter_now(&target); }) {
            if let Ok(mut controller) = window.state::<FocusWindowState>().0.lock() { controller.mode = Mode::Normal; }
            emit(&window, false, Some(error.to_string()));
        }
    });
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if window.label() != "main" { return; }
    let Some(webview) = window.app_handle().get_webview_window("main") else { return; };
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            let active = webview.state::<FocusWindowState>().0.lock().map(|c| c.active).unwrap_or(false);
            if active { api.prevent_close(); request_compact(webview); }
        }
        WindowEvent::Resized(_) => {
            if webview.is_minimized().unwrap_or(false) { request_compact(webview); }
            else { let _ = cache_normal(&webview); }
        }
        WindowEvent::Moved(_) => { let _ = cache_normal(&webview); }
        _ => {}
    }
}

async fn restore(window: WebviewWindow) -> Result<(), String> {
    own_main(&window)?;
    {
        let state = window.state::<FocusWindowState>();
        let mut controller = state.0.lock().map_err(|e| e.to_string())?;
        if controller.mode == Mode::Normal || controller.mode == Mode::Restoring { return Ok(()); }
        controller.mode = Mode::Restoring;
    }
    let (sender, receiver) = mpsc::channel();
    let target = window.clone();
    if let Err(error) = window.run_on_main_thread(move || { let _ = sender.send(restore_now(&target)); }) {
        window.state::<FocusWindowState>().0.lock().map_err(|e| e.to_string())?.mode = Mode::Compact;
        emit(&window, true, Some(error.to_string()));
        return Err(error.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(10)).map_err(|e| e.to_string()))
        .await.map_err(|e| e.to_string())??
}

#[tauri::command]
pub async fn focus_window_set_active(window: WebviewWindow, active: bool) -> Result<(), String> {
    own_main(&window)?;
    if active { cache_normal(&window)?; }
    window.state::<FocusWindowState>().0.lock().map_err(|e| e.to_string())?.active = active;
    if !active { restore(window).await?; }
    Ok(())
}
#[tauri::command]
pub async fn focus_window_restore(window: WebviewWindow) -> Result<(), String> { restore(window).await }
#[tauri::command]
pub fn focus_window_is_compact(window: WebviewWindow) -> Result<bool, String> {
    own_main(&window)?;
    Ok(window.state::<FocusWindowState>().0.lock().map_err(|e| e.to_string())?.mode != Mode::Normal)
}
#[tauri::command]
pub fn focus_window_drag(window: WebviewWindow) -> Result<(), String> {
    own_main(&window)?;
    if window.state::<FocusWindowState>().0.lock().map_err(|e| e.to_string())?.mode != Mode::Compact { return Ok(()); }
    window.start_dragging().map_err(|e| e.to_string())
}
