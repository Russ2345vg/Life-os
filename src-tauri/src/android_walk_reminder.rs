use crate::android_alarm::AndroidAlarm;
use crate::walk_reminder_contract::{WalkReminderConfiguration, WalkReminderReceipt};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WalkPayload { configuration_json: String }

#[tauri::command]
pub async fn walk_reminder_reconcile<R: Runtime>(app: AppHandle<R>, configuration: WalkReminderConfiguration) -> Result<WalkReminderReceipt, String> {
    configuration.validate()?;
    app.state::<AndroidAlarm<R>>().0.run_mobile_plugin_async("walkReminderReconcile", WalkPayload {
        configuration_json: serde_json::to_string(&configuration).map_err(|e| e.to_string())?,
    }).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn walk_reminder_status<R: Runtime>(app: AppHandle<R>) -> Result<WalkReminderReceipt, String> {
    app.state::<AndroidAlarm<R>>().0.run_mobile_plugin_async("walkReminderStatus", ()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn walk_reminder_open_settings<R: Runtime>(app: AppHandle<R>, issue: String) -> Result<(), String> {
    if !matches!(issue.as_str(), "EXACT_ALARM" | "NOTIFICATIONS") { return Err("Unknown walk permission".into()); }
    crate::android_alarm::android_alarm_open_settings(app, issue).await
}
