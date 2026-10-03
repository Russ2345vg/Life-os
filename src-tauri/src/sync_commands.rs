use crate::secure_key_store::{self, SecretId};
use crate::sync_crypto::{
    decrypt_local_value, decrypt_pilot_payload, decrypt_recovery_key_ring, decrypt_with_epoch_key,
    encrypt_local_value, encrypt_pilot_payload, encrypt_recovery_key_ring, encrypt_with_epoch_key,
    new_space_key_ring, rotate_key_ring, unwrap_key_ring, wrap_key_ring, CryptoEnvelope,
    DeviceKeyPair, EnvelopeMetadata, KeyRing, LocalCiphertext, PilotCryptoEnvelope,
    PilotCryptoMetadata, RecoveryEnvelope, RecoveryMaterial, PROTOCOL_VERSION,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use qrcode::{render::svg, EcLevel, QrCode};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use zeroize::Zeroizing;

const MAX_AUTH_SESSION_BYTES: usize = 1024 * 1024;
const MAX_LOCAL_SNAPSHOT_BYTES: usize = 64 * 1024 * 1024;

#[tauri::command]
pub async fn sync_encrypt_binary<R: tauri::Runtime>(
    app: AppHandle<R>,
    metadata: crate::sync_crypto::BinaryMetadata,
    plaintext: String,
) -> Result<crate::sync_crypto::BinaryEnvelope, String> {
    if plaintext.is_empty() || plaintext.len() > MAX_LOCAL_SNAPSHOT_BYTES {
        return Err("Invalid protected binary size.".to_owned());
    }
    let ring = load_key_ring(&app, &metadata.space_id).await?;
    crate::sync_crypto::encrypt_binary(&ring, plaintext.as_bytes(), metadata)
}

#[tauri::command]
pub async fn sync_decrypt_binary<R: tauri::Runtime>(
    app: AppHandle<R>,
    envelope: crate::sync_crypto::BinaryEnvelope,
) -> Result<String, String> {
    if envelope.ciphertext.len() > 96 * 1024 * 1024 {
        return Err("Invalid protected binary size.".to_owned());
    }
    let ring = load_key_ring(&app, &envelope.metadata.space_id).await?;
    let plaintext = crate::sync_crypto::decrypt_binary(&ring, &envelope)?;
    std::str::from_utf8(&plaintext)
        .map(str::to_owned)
        .map_err(|_| "Invalid protected binary payload.".to_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentityOutput {
    public_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstSpaceOutput {
    public_key: String,
    encrypted_device_name: String,
    encrypted_device_name_nonce: String,
    recovery_auth_verifier: String,
    recovery_envelope: RecoveryEnvelope,
    recovery_material: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingEnvelopeInput {
    space_id: String,
    sender_device_id: String,
    recipient_device_id: String,
    recipient_public_key: String,
    key_epoch: u32,
    purpose: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDecryptInput {
    recovery_material: String,
    envelope: RecoveryEnvelope,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryAuthorizationOutput {
    space_id: String,
    auth_proof: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationRecipient {
    device_id: String,
    public_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationOutput {
    key_epoch: u32,
    envelopes: Vec<CryptoEnvelope>,
    recovery_envelope: RecoveryEnvelope,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptDeviceNameInput {
    space_id: String,
    device_id: String,
    key_epoch: u32,
    device_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptPilotPayloadInput {
    metadata: PilotCryptoMetadata,
    plaintext: String,
}

#[tauri::command]
pub async fn sync_auth_session_write<R: tauri::Runtime>(
    app: AppHandle<R>,
    slot: String,
    value: String,
) -> Result<(), String> {
    if value.is_empty() || value.len() > MAX_AUTH_SESSION_BYTES {
        return Err("Invalid authentication session.".to_owned());
    }
    let id = SecretId::auth_session(&slot)?;
    secure_key_store::write(&app, &id, value.as_bytes()).await
}

#[tauri::command]
pub async fn sync_auth_session_read<R: tauri::Runtime>(
    app: AppHandle<R>,
    slot: String,
) -> Result<Option<String>, String> {
    let id = SecretId::auth_session(&slot)?;
    secure_key_store::read(&app, &id)
        .await?
        .map(|bytes| {
            String::from_utf8(bytes.to_vec())
                .map_err(|_| "Stored authentication session is invalid.".to_owned())
        })
        .transpose()
}

#[tauri::command]
pub async fn sync_auth_session_delete<R: tauri::Runtime>(
    app: AppHandle<R>,
    slot: String,
) -> Result<(), String> {
    let id = SecretId::auth_session(&slot)?;
    secure_key_store::delete(&app, &id).await
}

#[tauri::command]
pub async fn sync_prepare_device_identity<R: tauri::Runtime>(
    app: AppHandle<R>,
    device_id: String,
    allow_create: bool,
) -> Result<DeviceIdentityOutput, String> {
    let key_pair = load_or_create_device(&app, &device_id, allow_create).await?;
    Ok(DeviceIdentityOutput {
        public_key: key_pair.public_base64(),
    })
}

#[tauri::command]
pub async fn sync_promote_recovery_identity<R: tauri::Runtime>(
    app: AppHandle<R>,
    device_id: String,
    candidate_device_id: String,
) -> Result<DeviceIdentityOutput, String> {
    let target = SecretId::device_private_key(&device_id)?;
    let candidate = SecretId::device_private_key(&candidate_device_id)?;
    secure_key_store::promote_recovery_identity(&app, &target, &candidate).await?;
    let key_pair = load_or_create_device(&app, &device_id, false).await?;
    Ok(DeviceIdentityOutput {
        public_key: key_pair.public_base64(),
    })
}

#[tauri::command]
pub async fn sync_delete_device_secrets<R: tauri::Runtime>(
    app: AppHandle<R>,
    device_id: String,
    space_id: String,
) -> Result<(), String> {
    let (device, space) = device_secret_ids(&device_id, &space_id)?;
    secure_key_store::delete(&app, &device).await?;
    secure_key_store::delete(&app, &space).await
}

fn device_secret_ids(device_id: &str, space_id: &str) -> Result<(SecretId, SecretId), String> {
    Ok((
        SecretId::device_private_key(device_id)?,
        SecretId::space_key_ring(space_id)?,
    ))
}

#[tauri::command]
pub async fn sync_prepare_first_space<R: tauri::Runtime>(
    app: AppHandle<R>,
    device_id: String,
    space_id: String,
    device_name: String,
) -> Result<FirstSpaceOutput, String> {
    let name = device_name.trim();
    if name.is_empty() || name.len() > 96 {
        return Err("Invalid device name.".to_owned());
    }
    let device = load_or_create_device(&app, &device_id, true).await?;
    let key_ring = new_space_key_ring()?;
    let recovery = RecoveryMaterial::generate();
    let recovery_metadata = EnvelopeMetadata {
        protocol_version: PROTOCOL_VERSION,
        purpose: "recovery".to_owned(),
        space_id: space_id.clone(),
        // Recovery envelopes are not addressed to a device: the same envelope must
        // remain decryptable when every previous device has been lost.
        recipient_device_id: space_id.clone(),
        key_epoch: 1,
    };
    let recovery_envelope = encrypt_recovery_key_ring(&recovery, &key_ring, recovery_metadata)?;
    let name_envelope = encrypt_with_epoch_key(
        &key_ring,
        name.as_bytes(),
        EnvelopeMetadata {
            protocol_version: PROTOCOL_VERSION,
            purpose: "device_name".to_owned(),
            space_id: space_id.clone(),
            recipient_device_id: device_id.clone(),
            key_epoch: 1,
        },
    )?;

    store_key_ring(&app, &space_id, &key_ring).await?;
    secure_key_store::write(
        &app,
        &SecretId::recovery_root(&space_id)?,
        &recovery.root_bytes(),
    )
    .await?;

    Ok(FirstSpaceOutput {
        public_key: device.public_base64(),
        encrypted_device_name: name_envelope.ciphertext,
        encrypted_device_name_nonce: name_envelope.nonce,
        recovery_auth_verifier: URL_SAFE_NO_PAD.encode(recovery.verifier()?),
        recovery_envelope,
        recovery_material: recovery.printable(&space_id),
    })
}

#[tauri::command]
pub async fn sync_wrap_key_ring<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: PairingEnvelopeInput,
) -> Result<CryptoEnvelope, String> {
    let sender = load_or_create_device(&app, &input.sender_device_id, false).await?;
    let key_ring = load_key_ring(&app, &input.space_id).await?;
    wrap_key_ring(
        &sender,
        &input.recipient_public_key,
        &key_ring,
        EnvelopeMetadata {
            protocol_version: PROTOCOL_VERSION,
            purpose: input.purpose,
            space_id: input.space_id,
            recipient_device_id: input.recipient_device_id,
            key_epoch: input.key_epoch,
        },
    )
}

#[tauri::command]
pub async fn sync_unwrap_and_store_key_ring<R: tauri::Runtime>(
    app: AppHandle<R>,
    device_id: String,
    envelope: CryptoEnvelope,
) -> Result<(), String> {
    if envelope.metadata.recipient_device_id != device_id {
        return Err("Envelope recipient does not match this device.".to_owned());
    }
    let recipient = load_or_create_device(&app, &device_id, false).await?;
    let key_ring = unwrap_key_ring(&recipient, &envelope)?;
    store_key_ring(&app, &envelope.metadata.space_id, &key_ring).await
}

#[tauri::command]
pub async fn sync_prepare_recovery_authorization(
    recovery_material: String,
) -> Result<RecoveryAuthorizationOutput, String> {
    let (space_id, recovery) = RecoveryMaterial::parse(&recovery_material)?;
    Ok(RecoveryAuthorizationOutput {
        space_id,
        auth_proof: URL_SAFE_NO_PAD.encode(recovery.auth_proof()?.as_slice()),
    })
}

#[tauri::command]
pub async fn sync_export_recovery_material<R: tauri::Runtime>(
    app: AppHandle<R>,
    space_id: String,
) -> Result<String, String> {
    let root = secure_key_store::read(&app, &SecretId::recovery_root(&space_id)?)
        .await?
        .ok_or_else(|| "Recovery material is unavailable.".to_owned())?;
    Ok(RecoveryMaterial::from_root(&root)?.printable(&space_id))
}

#[tauri::command]
pub async fn sync_require_recovery_material<R: tauri::Runtime>(
    app: AppHandle<R>,
    space_id: String,
) -> Result<(), String> {
    let root = secure_key_store::read(&app, &SecretId::recovery_root(&space_id)?)
        .await?
        .ok_or_else(|| "Recovery material is unavailable for rotation.".to_owned())?;
    RecoveryMaterial::from_root(&root)?;
    Ok(())
}

#[tauri::command]
pub fn sync_platform() -> Result<&'static str, String> {
    #[cfg(target_os = "windows")]
    return Ok("windows");
    #[cfg(target_os = "android")]
    return Ok("android");
    #[allow(unreachable_code)]
    Err("Unsupported LifeOS platform.".to_owned())
}

#[tauri::command]
pub async fn sync_recover_and_store_key_ring<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: RecoveryDecryptInput,
) -> Result<(), String> {
    let (space_id, recovery) = RecoveryMaterial::parse(&input.recovery_material)?;
    if input.envelope.metadata.space_id != space_id {
        return Err("Recovery material does not match the Sync space.".to_owned());
    }
    let key_ring = decrypt_recovery_key_ring(&recovery, &input.envelope)?;
    store_key_ring(&app, &space_id, &key_ring).await?;
    secure_key_store::write(
        &app,
        &SecretId::recovery_root(&space_id)?,
        &recovery.root_bytes(),
    )
    .await
}

#[tauri::command]
pub async fn sync_encrypt_device_name<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: EncryptDeviceNameInput,
) -> Result<RecoveryEnvelope, String> {
    let name = input.device_name.trim();
    if name.is_empty() || name.len() > 96 {
        return Err("Invalid device name.".to_owned());
    }
    let key_ring = load_key_ring(&app, &input.space_id).await?;
    encrypt_with_epoch_key(
        &key_ring,
        name.as_bytes(),
        EnvelopeMetadata {
            protocol_version: PROTOCOL_VERSION,
            purpose: "device_name".to_owned(),
            space_id: input.space_id,
            recipient_device_id: input.device_id,
            key_epoch: input.key_epoch,
        },
    )
}

#[tauri::command]
pub async fn sync_decrypt_device_name<R: tauri::Runtime>(
    app: AppHandle<R>,
    envelope: RecoveryEnvelope,
) -> Result<String, String> {
    if envelope.metadata.purpose != "device_name" {
        return Err("Invalid encrypted device name.".to_owned());
    }
    let key_ring = load_key_ring(&app, &envelope.metadata.space_id).await?;
    let plaintext = decrypt_with_epoch_key(&key_ring, &envelope)?;
    let name =
        std::str::from_utf8(&plaintext).map_err(|_| "Invalid encrypted device name.".to_owned())?;
    if name.trim().is_empty() || name.len() > 96 {
        return Err("Invalid encrypted device name.".to_owned());
    }
    Ok(name.to_owned())
}

#[tauri::command]
pub async fn sync_encrypt_pilot_payload<R: tauri::Runtime>(
    app: AppHandle<R>,
    input: EncryptPilotPayloadInput,
) -> Result<PilotCryptoEnvelope, String> {
    if input.plaintext.is_empty() || input.plaintext.len() > 256 * 1024 {
        return Err("Invalid pilot payload.".to_owned());
    }
    let key_ring = load_key_ring(&app, &input.metadata.space_id).await?;
    encrypt_pilot_payload(&key_ring, input.plaintext.as_bytes(), input.metadata)
}

#[tauri::command]
pub async fn sync_decrypt_pilot_payload<R: tauri::Runtime>(
    app: AppHandle<R>,
    envelope: PilotCryptoEnvelope,
) -> Result<String, String> {
    let key_ring = load_key_ring(&app, &envelope.metadata.space_id).await?;
    let plaintext = decrypt_pilot_payload(&key_ring, &envelope)?;
    std::str::from_utf8(&plaintext)
        .map(str::to_owned)
        .map_err(|_| "Invalid decrypted pilot payload.".to_owned())
}

#[tauri::command]
pub async fn sync_encrypt_local_snapshot<R: tauri::Runtime>(
    app: AppHandle<R>,
    snapshot_id: String,
    plaintext: String,
) -> Result<LocalCiphertext, String> {
    if plaintext.is_empty() || plaintext.len() > MAX_LOCAL_SNAPSHOT_BYTES {
        return Err("Invalid local snapshot payload.".to_owned());
    }
    let secret_id = SecretId::snapshot_key(&snapshot_id)?;
    let key = match secure_key_store::read(&app, &secret_id).await? {
        Some(existing) => existing,
        None => {
            let mut generated = Zeroizing::new([0_u8; 32]);
            OsRng.fill_bytes(generated.as_mut());
            secure_key_store::write(&app, &secret_id, generated.as_slice()).await?;
            Zeroizing::new(generated.to_vec())
        }
    };
    encrypt_local_value(
        &key,
        plaintext.as_bytes(),
        snapshot_aad(&snapshot_id).as_bytes(),
    )
}

#[tauri::command]
pub async fn sync_decrypt_local_snapshot<R: tauri::Runtime>(
    app: AppHandle<R>,
    snapshot_id: String,
    envelope: LocalCiphertext,
) -> Result<String, String> {
    let key = secure_key_store::read(&app, &SecretId::snapshot_key(&snapshot_id)?)
        .await?
        .ok_or_else(|| "Local snapshot key is unavailable.".to_owned())?;
    let plaintext = decrypt_local_value(&key, &envelope, snapshot_aad(&snapshot_id).as_bytes())?;
    std::str::from_utf8(&plaintext)
        .map(str::to_owned)
        .map_err(|_| "Invalid decrypted local snapshot.".to_owned())
}

fn snapshot_aad(snapshot_id: &str) -> String {
    format!("lifeos-local-snapshot-v1:{snapshot_id}")
}

#[tauri::command]
pub async fn sync_prepare_rotation<R: tauri::Runtime>(
    app: AppHandle<R>,
    space_id: String,
    sender_device_id: String,
    next_epoch: u32,
    recipients: Vec<RotationRecipient>,
) -> Result<RotationOutput, String> {
    if recipients.is_empty() {
        return Err("Rotation requires at least one active recipient.".to_owned());
    }
    let sender = load_or_create_device(&app, &sender_device_id, false).await?;
    let mut key_ring = load_key_ring(&app, &space_id).await?;
    rotate_key_ring(&mut key_ring, next_epoch)?;
    let mut envelopes = Vec::with_capacity(recipients.len());
    for recipient in recipients {
        envelopes.push(wrap_key_ring(
            &sender,
            &recipient.public_key,
            &key_ring,
            EnvelopeMetadata {
                protocol_version: PROTOCOL_VERSION,
                purpose: "rotation".to_owned(),
                space_id: space_id.clone(),
                recipient_device_id: recipient.device_id,
                key_epoch: next_epoch,
            },
        )?);
    }
    let recovery_root = secure_key_store::read(&app, &SecretId::recovery_root(&space_id)?)
        .await?
        .ok_or_else(|| "Recovery material is unavailable for rotation.".to_owned())?;
    let recovery = RecoveryMaterial::from_root(&recovery_root)?;
    let recovery_envelope = encrypt_recovery_key_ring(
        &recovery,
        &key_ring,
        EnvelopeMetadata {
            protocol_version: PROTOCOL_VERSION,
            purpose: "recovery".to_owned(),
            space_id: space_id.clone(),
            recipient_device_id: space_id.clone(),
            key_epoch: next_epoch,
        },
    )?;
    store_key_ring(&app, &space_id, &key_ring).await?;
    Ok(RotationOutput {
        key_epoch: next_epoch,
        envelopes,
        recovery_envelope,
    })
}

#[tauri::command]
pub fn sync_hash_pairing_secret(secret: String) -> Result<String, String> {
    if secret.len() != 64 || !secret.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid pairing secret.".to_owned());
    }
    let decoded = (0..secret.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&secret[index..index + 2], 16))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Invalid pairing secret.".to_owned())?;
    Ok(hex(&Sha256::digest(decoded)))
}

#[tauri::command]
pub fn sync_render_pairing_qr(payload: String) -> Result<String, String> {
    if payload.is_empty() || payload.len() > 2048 {
        return Err("Invalid pairing payload.".to_owned());
    }
    let code = QrCode::with_error_correction_level(payload.as_bytes(), EcLevel::M)
        .map_err(|_| "Pairing QR could not be generated.".to_owned())?;
    Ok(code
        .render::<svg::Color>()
        .min_dimensions(256, 256)
        .quiet_zone(true)
        .dark_color(svg::Color("#0d100f"))
        .light_color(svg::Color("#f1f3ef"))
        .build())
}

async fn load_or_create_device<R: tauri::Runtime>(
    app: &AppHandle<R>,
    device_id: &str,
    allow_create: bool,
) -> Result<DeviceKeyPair, String> {
    let id = SecretId::device_private_key(device_id)?;
    if let Some(private) = secure_key_store::read(app, &id).await? {
        return DeviceKeyPair::from_private_bytes(&private);
    }
    if !allow_create {
        return Err("Device private key is unavailable.".to_owned());
    }
    let pair = DeviceKeyPair::generate();
    secure_key_store::write(app, &id, &pair.private_bytes()).await?;
    Ok(pair)
}

async fn load_key_ring<R: tauri::Runtime>(
    app: &AppHandle<R>,
    space_id: &str,
) -> Result<KeyRing, String> {
    let bytes = secure_key_store::read(app, &SecretId::space_key_ring(space_id)?)
        .await?
        .ok_or_else(|| "Space key ring is unavailable.".to_owned())?;
    serde_json::from_slice(&bytes).map_err(|_| "Stored key ring is invalid.".to_owned())
}

async fn store_key_ring<R: tauri::Runtime>(
    app: &AppHandle<R>,
    space_id: &str,
    key_ring: &KeyRing,
) -> Result<(), String> {
    let serialized = Zeroizing::new(
        serde_json::to_vec(key_ring).map_err(|_| "Key ring serialization failed.".to_owned())?,
    );
    secure_key_store::write(app, &SecretId::space_key_ring(space_id)?, &serialized).await
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_hash_accepts_the_manual_code_hex_contract() {
        let secret = "00".repeat(32);
        assert_eq!(
            sync_hash_pairing_secret(secret).expect("hash"),
            "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925"
        );
        assert!(sync_hash_pairing_secret("not-a-secret".to_owned()).is_err());
    }

    #[test]
    fn pairing_qr_is_rendered_locally_as_svg() {
        let payload = r#"{"protocol":"lifeos-sync-pair-v1"}"#.to_owned();
        let svg = sync_render_pairing_qr(payload).expect("QR SVG");
        assert!(svg.starts_with("<?xml"));
        assert!(svg.contains("<svg"));
        assert!(sync_render_pairing_qr(String::new()).is_err());
    }

    #[test]
    fn sync_delete_device_secrets_scopes_validated_ids_without_auth_session() {
        let (device, space) = device_secret_ids(
            "10000000-0000-4000-8000-000000000001",
            "20000000-0000-4000-8000-000000000001",
        )
        .expect("valid ids");
        let auth = SecretId::auth_session("supabase-auth-session").expect("auth id");
        assert_ne!(device.storage_name(), space.storage_name());
        assert_ne!(device.storage_name(), auth.storage_name());
        assert_ne!(space.storage_name(), auth.storage_name());
    }

    #[test]
    fn sync_delete_device_secrets_rejects_malformed_ids() {
        assert!(device_secret_ids("not-a-uuid", "20000000-0000-4000-8000-000000000001").is_err());
        assert!(device_secret_ids("10000000-0000-4000-8000-000000000001", "bad-space").is_err());
    }

    #[test]
    fn auth_storage_slots_keep_session_and_pkce_values_separate() {
        let session = SecretId::auth_session("supabase-auth-session").expect("session slot");
        let flow =
            SecretId::auth_session("supabase-auth-pkce-flow-0123456789abcdef0123456789abcdef")
                .expect("flow slot");
        let index = SecretId::auth_session("supabase-auth-pkce-flow-index").expect("index slot");
        let legacy = SecretId::auth_session("supabase-auth-pkce-legacy").expect("legacy slot");

        let names = [
            session.storage_name(),
            flow.storage_name(),
            index.storage_name(),
            legacy.storage_name(),
        ];
        assert_eq!(
            names.iter().collect::<std::collections::HashSet<_>>().len(),
            4
        );
        assert!(SecretId::auth_session("supabase-auth-pkce-flow-not-hex").is_err());
        assert!(SecretId::auth_session("device-private-key").is_err());
    }

    #[test]
    fn auth_storage_user_slot_does_not_replace_existing_session() {
        let user = SecretId::auth_session("supabase-auth-user").expect("SDK user slot");
        let session = SecretId::auth_session("supabase-auth-session").expect("existing slot");
        assert_ne!(user.storage_name(), session.storage_name());
        assert!(SecretId::auth_session("supabase-auth-user-private-key").is_err());
    }
}
