use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[derive(Serialize)]
struct SpeechPayload {
    language: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidSpeechResult {
    transcript: String,
}

struct AndroidSpeech<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("lifeos-speech")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.lifeos.desktop", "LifeOsSpeechPlugin")?;
            app.manage(AndroidSpeech(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub async fn android_speech_recognize<R: Runtime>(
    app: AppHandle<R>,
    language: String,
) -> Result<AndroidSpeechResult, String> {
    app.state::<AndroidSpeech<R>>()
        .0
        .run_mobile_plugin_async("recognize", SpeechPayload { language })
        .await
        .map_err(|error| error.to_string())
}
