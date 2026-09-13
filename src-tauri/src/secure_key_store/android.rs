use super::SecretId;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{plugin::TauriPlugin, Manager, Runtime};
use zeroize::Zeroizing;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WritePayload {
    secret_id: String,
    value: String,
    aad: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretPayload {
    secret_id: String,
    aad: String,
}

#[derive(Deserialize)]
struct ReadResponse {
    value: Option<String>,
}

struct AndroidSecureStorage<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("lifeos-secure-storage")
        .setup(|app, api| {
            let handle =
                api.register_android_plugin("com.lifeos.desktop", "LifeOsSecureStoragePlugin")?;
            app.manage(AndroidSecureStorage(handle));
            Ok(())
        })
        .build()
}

pub async fn store<R: Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
    value: &[u8],
) -> Result<(), String> {
    app.state::<AndroidSecureStorage<R>>()
        .0
        .run_mobile_plugin_async(
            "writeSecret",
            WritePayload {
                secret_id: id.storage_name(),
                value: STANDARD.encode(value),
                aad: STANDARD.encode(id.aad()),
            },
        )
        .await
        .map_err(|_| "Android secure storage write failed.".to_owned())
}

pub async fn load<R: Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
    let response = app
        .state::<AndroidSecureStorage<R>>()
        .0
        .run_mobile_plugin_async::<ReadResponse>(
            "readSecret",
            SecretPayload {
                secret_id: id.storage_name(),
                aad: STANDARD.encode(id.aad()),
            },
        )
        .await
        .map_err(|_| "Android secure storage read failed.".to_owned())?;
    response
        .value
        .map(|value| {
            STANDARD
                .decode(value)
                .map(Zeroizing::new)
                .map_err(|_| "Android secure storage data is invalid.".to_owned())
        })
        .transpose()
}

pub async fn delete<R: Runtime>(app: &tauri::AppHandle<R>, id: &SecretId) -> Result<(), String> {
    app.state::<AndroidSecureStorage<R>>()
        .0
        .run_mobile_plugin_async(
            "deleteSecret",
            SecretPayload {
                secret_id: id.storage_name(),
                aad: STANDARD.encode(id.aad()),
            },
        )
        .await
        .map_err(|_| "Android secure storage delete failed.".to_owned())
}
