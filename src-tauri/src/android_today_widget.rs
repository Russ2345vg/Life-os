use serde::Serialize;
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotPayload {
    snapshot_json: String,
}

#[derive(serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetOpenResult {
    open_today: bool,
}

struct TodayWidget<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("lifeos-today-widget")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("com.lifeos.desktop", "LifeOsTodayWidgetPlugin")?;
            app.manage(TodayWidget(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn android_today_widget_update<R: Runtime>(
    app: AppHandle<R>,
    snapshot_json: String,
) -> Result<(), String> {
    app.state::<TodayWidget<R>>()
        .0
        .run_mobile_plugin_async::<()>("update", SnapshotPayload { snapshot_json })
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn android_today_widget_consume_open<R: Runtime>(
    app: AppHandle<R>,
) -> Result<WidgetOpenResult, String> {
    app.state::<TodayWidget<R>>()
        .0
        .run_mobile_plugin_async("consumeOpen", ())
        .await
        .map_err(|error| error.to_string())
}
