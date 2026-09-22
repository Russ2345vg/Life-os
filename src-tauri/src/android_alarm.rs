use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidAlarmOccurrence {
    id: String,
    cycle_date: String,
    scheduled_at_epoch_millis: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidAlarmSchedule {
    enabled: bool,
    settings_version: u32,
    wake_time: String,
    time_zone: String,
    sound_uri: Option<String>,
    sound_title: String,
    next_occurrence: Option<AndroidAlarmOccurrence>,
}

#[derive(Serialize)]
struct ReconcilePayload {
    schedule: AndroidAlarmSchedule,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TestPayload {
    delay_seconds: u32,
    sound_uri: Option<String>,
    sound_title: String,
}

#[derive(Serialize)]
struct SettingsPayload {
    issue: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidAlarmStatus {
    supported: bool,
    state: String,
    exact_alarm_granted: bool,
    notifications_granted: bool,
    full_screen_granted: bool,
    issues: Vec<String>,
    next_occurrence_id: Option<String>,
    next_scheduled_at_epoch_millis: Option<i64>,
    acknowledged_settings_version: Option<u32>,
    last_delivered_at_epoch_millis: Option<i64>,
    message: Option<String>,
}

struct AndroidAlarm<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("lifeos-alarm")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.lifeos.desktop", "LifeOsAlarmPlugin")?;
            app.manage(AndroidAlarm(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn android_alarm_reconcile<R: Runtime>(
    app: AppHandle<R>,
    schedule: AndroidAlarmSchedule,
) -> Result<AndroidAlarmStatus, String> {
    app.state::<AndroidAlarm<R>>()
        .0
        .run_mobile_plugin_async("reconcile", ReconcilePayload { schedule })
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn android_alarm_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AndroidAlarmStatus, String> {
    app.state::<AndroidAlarm<R>>()
        .0
        .run_mobile_plugin_async("status", ())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn android_alarm_list_sounds<R: Runtime>(
    app: AppHandle<R>,
) -> Result<serde_json::Value, String> {
    app.state::<AndroidAlarm<R>>()
        .0
        .run_mobile_plugin_async("listSounds", ())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn android_alarm_schedule_test<R: Runtime>(
    app: AppHandle<R>,
    delay_seconds: u32,
    sound_uri: Option<String>,
    sound_title: String,
) -> Result<AndroidAlarmStatus, String> {
    app.state::<AndroidAlarm<R>>()
        .0
        .run_mobile_plugin_async(
            "scheduleTest",
            TestPayload {
                delay_seconds,
                sound_uri,
                sound_title,
            },
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn android_alarm_open_settings<R: Runtime>(
    app: AppHandle<R>,
    issue: String,
) -> Result<(), String> {
    app.state::<AndroidAlarm<R>>()
        .0
        .run_mobile_plugin_async("openSettings", SettingsPayload { issue })
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn android_alarm_stop<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.state::<AndroidAlarm<R>>()
        .0
        .run_mobile_plugin_async("stop", ())
        .await
        .map_err(|error| error.to_string())
}
