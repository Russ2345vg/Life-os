use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidUpdate {
    version: String,
    version_code: u64,
    notes: String,
    apk_url: String,
    sha256: String,
    package_id: String,
}

#[derive(Serialize)]
struct CheckPayload {
    endpoint: String,
}

#[derive(Serialize)]
struct InstallPayload {
    update: AndroidUpdate,
}

struct AndroidUpdater<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("android-updater")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("com.lifeos.desktop", "AndroidUpdaterPlugin")?;
            app.manage(AndroidUpdater(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn android_check_update<R: Runtime>(
    app: AppHandle<R>,
    endpoint: String,
) -> Result<Option<AndroidUpdate>, String> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async("checkUpdate", CheckPayload { endpoint })
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn android_download_and_install<R: Runtime>(
    app: AppHandle<R>,
    update: AndroidUpdate,
) -> Result<serde_json::Value, String> {
    app.state::<AndroidUpdater<R>>()
        .0
        .run_mobile_plugin_async("downloadAndInstall", InstallPayload { update })
        .await
        .map_err(|error| error.to_string())
}
