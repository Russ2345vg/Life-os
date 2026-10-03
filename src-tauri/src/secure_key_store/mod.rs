#[cfg(target_os = "android")]
pub(crate) mod android;
#[cfg(target_os = "windows")]
mod windows;

use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

const AUTH_SESSION_ID: &str = "auth:session:v1";

#[derive(Clone)]
pub enum SecretId {
    AuthSession,
    AuthUser,
    AuthPkce { slot: String },
    DevicePrivateKey { device_id: String },
    SpaceKeyRing { space_id: String },
    RecoveryRoot { space_id: String },
    SnapshotKey { snapshot_id: String },
}

impl SecretId {
    pub fn auth_session(slot: &str) -> Result<Self, String> {
        if slot == "supabase-auth-session" {
            return Ok(Self::AuthSession);
        }
        if slot == "supabase-auth-user" {
            return Ok(Self::AuthUser);
        }
        if slot == "supabase-auth-pkce-flow-index"
            || slot == "supabase-auth-pkce-legacy"
            || valid_auth_pkce_flow_slot(slot)
        {
            return Ok(Self::AuthPkce {
                slot: slot.to_owned(),
            });
        }
        Err("Unsupported authentication storage slot.".to_owned())
    }

    pub fn device_private_key(device_id: &str) -> Result<Self, String> {
        require_uuid(device_id)?;
        Ok(Self::DevicePrivateKey {
            device_id: device_id.to_owned(),
        })
    }

    pub fn space_key_ring(space_id: &str) -> Result<Self, String> {
        require_uuid(space_id)?;
        Ok(Self::SpaceKeyRing {
            space_id: space_id.to_owned(),
        })
    }

    pub fn recovery_root(space_id: &str) -> Result<Self, String> {
        require_uuid(space_id)?;
        Ok(Self::RecoveryRoot {
            space_id: space_id.to_owned(),
        })
    }

    pub fn snapshot_key(snapshot_id: &str) -> Result<Self, String> {
        require_uuid(snapshot_id)?;
        Ok(Self::SnapshotKey {
            snapshot_id: snapshot_id.to_owned(),
        })
    }

    fn label(&self) -> String {
        match self {
            Self::AuthSession => AUTH_SESSION_ID.to_owned(),
            Self::AuthUser => "auth:user:v1".to_owned(),
            Self::AuthPkce { slot } => format!("auth:pkce:v1:{slot}"),
            Self::DevicePrivateKey { device_id } => format!("device:{device_id}:x25519:v1"),
            Self::SpaceKeyRing { space_id } => format!("space:{space_id}:keyring:v1"),
            Self::RecoveryRoot { space_id } => format!("space:{space_id}:recovery:v1"),
            Self::SnapshotKey { snapshot_id } => format!("snapshot:{snapshot_id}:key:v1"),
        }
    }

    pub fn storage_name(&self) -> String {
        let digest = Sha256::digest(self.label().as_bytes());
        digest.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[cfg(target_os = "android")]
    pub fn aad(&self) -> Vec<u8> {
        format!("lifeos-secure-store-v1:{}", self.label()).into_bytes()
    }
}

fn valid_auth_pkce_flow_slot(slot: &str) -> bool {
    let Some(flow_id) = slot.strip_prefix("supabase-auth-pkce-flow-") else {
        return false;
    };
    flow_id.len() == 32 && flow_id.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(target_os = "windows")]
pub async fn write<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
    value: &[u8],
) -> Result<(), String> {
    windows::store(app, id, value)
}

#[cfg(target_os = "windows")]
pub async fn read<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
    windows::load(app, id)
}

#[cfg(target_os = "windows")]
pub async fn delete<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
) -> Result<(), String> {
    windows::delete(app, id)
}

#[cfg(target_os = "windows")]
pub async fn promote_recovery_identity<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    target: &SecretId,
    candidate: &SecretId,
) -> Result<(), String> {
    windows::promote_recovery_identity(app, target, candidate)
}

#[cfg(target_os = "android")]
pub async fn write<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
    value: &[u8],
) -> Result<(), String> {
    android::store(app, id, value).await
}

#[cfg(target_os = "android")]
pub async fn read<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
    android::load(app, id).await
}

#[cfg(target_os = "android")]
pub async fn delete<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
) -> Result<(), String> {
    android::delete(app, id).await
}

#[cfg(target_os = "android")]
pub async fn promote_recovery_identity<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _target: &SecretId,
    _candidate: &SecretId,
) -> Result<(), String> {
    Err("Recovery identity promotion is unavailable on this platform.".to_owned())
}

fn require_uuid(value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    let valid = bytes.len() == 36
        && [8, 13, 18, 23].iter().all(|index| bytes[*index] == b'-')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit());
    if valid {
        Ok(())
    } else {
        Err("Invalid Sync identifier.".to_owned())
    }
}
