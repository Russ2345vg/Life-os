use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

pub const PROTOCOL_VERSION: u8 = 1;
const KEY_SIZE: usize = 32;
const NONCE_SIZE: usize = 24;
const RECOVERY_PREFIX: &str = "LIFEOS-RECOVERY-V1";

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvelopeMetadata {
    pub protocol_version: u8,
    pub purpose: String,
    pub space_id: String,
    pub recipient_device_id: String,
    pub key_epoch: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoEnvelope {
    pub metadata: EnvelopeMetadata,
    pub sender_public_key: String,
    pub ciphertext: String,
    pub nonce: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEnvelope {
    pub metadata: EnvelopeMetadata,
    pub ciphertext: String,
    pub nonce: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotCryptoMetadata {
    pub protocol_version: u8,
    pub purpose: String,
    pub space_id: String,
    pub event_id: String,
    pub object_id: String,
    pub origin_device_id: String,
    pub key_epoch: u32,
    pub operation: String,
    pub base_revision: u64,
    pub revision: u64,
    pub hlc_wall_time: u64,
    pub hlc_logical: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotCryptoEnvelope {
    pub metadata: PilotCryptoMetadata,
    pub ciphertext: String,
    pub nonce: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCiphertext {
    pub ciphertext: String,
    pub nonce: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryMetadata {
    pub protocol_version: u8,
    pub purpose: String,
    pub space_id: String,
    pub object_id: String,
    pub key_epoch: u32,
    pub blob_version: u32,
    pub snapshot_kind: String,
    pub schema_version: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryEnvelope {
    pub metadata: BinaryMetadata,
    pub ciphertext: String,
    pub nonce: String,
}

fn binary_key(ring: &KeyRing, metadata: &BinaryMetadata) -> Result<Zeroizing<Vec<u8>>, String> {
    if metadata.protocol_version != 1
        || metadata.schema_version != 1
        || metadata.blob_version == 0
        || metadata.space_id.is_empty()
        || metadata.object_id.is_empty()
        || !matches!(metadata.purpose.as_str(), "attachment" | "snapshot")
        || (metadata.purpose == "attachment" && !metadata.snapshot_kind.is_empty())
        || (metadata.purpose == "snapshot"
            && !matches!(
                metadata.snapshot_kind.as_str(),
                "manual" | "daily" | "weekly" | "pre-restore"
            ))
    {
        return Err("Invalid protected binary context.".to_owned());
    }
    let epoch_key = decode_epoch_key(ring, metadata.key_epoch)?;
    let hkdf = Hkdf::<Sha256>::new(Some(b"lifeos-binary-v1"), &epoch_key);
    let mut key = Zeroizing::new(vec![0_u8; KEY_SIZE]);
    hkdf.expand(metadata.purpose.as_bytes(), key.as_mut_slice())
        .map_err(|_| "Binary key derivation failed.".to_owned())?;
    Ok(key)
}

pub fn encrypt_binary(
    ring: &KeyRing,
    plaintext: &[u8],
    metadata: BinaryMetadata,
) -> Result<BinaryEnvelope, String> {
    let key = binary_key(ring, &metadata)?;
    let aad = serde_json::to_vec(&metadata).map_err(|_| "Invalid binary context.".to_owned())?;
    let encrypted = encrypt_local_value(&key, plaintext, &aad)?;
    Ok(BinaryEnvelope {
        metadata,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
    })
}

pub fn decrypt_binary(
    ring: &KeyRing,
    envelope: &BinaryEnvelope,
) -> Result<Zeroizing<Vec<u8>>, String> {
    let key = binary_key(ring, &envelope.metadata)?;
    let aad =
        serde_json::to_vec(&envelope.metadata).map_err(|_| "Invalid binary context.".to_owned())?;
    decrypt_local_value(
        &key,
        &LocalCiphertext {
            ciphertext: envelope.ciphertext.clone(),
            nonce: envelope.nonce.clone(),
        },
        &aad,
    )
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct KeyRing {
    pub keys: BTreeMap<u32, String>,
}

pub struct DeviceKeyPair {
    secret: StaticSecret,
    public: PublicKey,
}

impl DeviceKeyPair {
    pub fn generate() -> Self {
        let secret = StaticSecret::random_from_rng(OsRng);
        let public = PublicKey::from(&secret);
        Self { secret, public }
    }

    pub fn from_private_bytes(bytes: &[u8]) -> Result<Self, String> {
        let private: [u8; KEY_SIZE] = bytes
            .try_into()
            .map_err(|_| "Invalid device private key.".to_owned())?;
        let secret = StaticSecret::from(private);
        let public = PublicKey::from(&secret);
        Ok(Self { secret, public })
    }

    pub fn private_bytes(&self) -> Zeroizing<Vec<u8>> {
        Zeroizing::new(self.secret.to_bytes().to_vec())
    }

    pub fn public_base64(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.public.as_bytes())
    }
}

pub fn new_space_key_ring() -> Result<KeyRing, String> {
    let mut key = Zeroizing::new([0_u8; KEY_SIZE]);
    OsRng.fill_bytes(key.as_mut());
    let mut keys = BTreeMap::new();
    keys.insert(1, URL_SAFE_NO_PAD.encode(key.as_slice()));
    Ok(KeyRing { keys })
}

pub fn rotate_key_ring(key_ring: &mut KeyRing, next_epoch: u32) -> Result<(), String> {
    let current = key_ring
        .keys
        .keys()
        .next_back()
        .copied()
        .ok_or_else(|| "Key ring is empty.".to_owned())?;
    // A revoke can be committed before all replacement envelopes are published.
    // Retrying that interrupted operation must reuse the already persisted epoch.
    if next_epoch == current && key_ring.keys.contains_key(&next_epoch) {
        return Ok(());
    }
    if next_epoch < 2 || next_epoch != current + 1 {
        return Err("Invalid key epoch transition.".to_owned());
    }
    let mut key = Zeroizing::new([0_u8; KEY_SIZE]);
    OsRng.fill_bytes(key.as_mut());
    key_ring
        .keys
        .insert(next_epoch, URL_SAFE_NO_PAD.encode(key.as_slice()));
    Ok(())
}

pub fn wrap_key_ring(
    sender: &DeviceKeyPair,
    recipient_public_key: &str,
    key_ring: &KeyRing,
    metadata: EnvelopeMetadata,
) -> Result<CryptoEnvelope, String> {
    validate_metadata(&metadata)?;
    let recipient = decode_public_key(recipient_public_key)?;
    let shared = sender.secret.diffie_hellman(&recipient);
    if shared.as_bytes().iter().all(|byte| *byte == 0) {
        return Err("Invalid recipient public key.".to_owned());
    }
    let aad = authenticated_data(&metadata)?;
    let wrapping_key = derive_envelope_key(shared.as_bytes(), &aad)?;
    let plaintext = Zeroizing::new(
        serde_json::to_vec(key_ring).map_err(|_| "Key ring serialization failed.".to_owned())?,
    );
    let (ciphertext, nonce) = encrypt(&wrapping_key, &plaintext, &aad)?;
    Ok(CryptoEnvelope {
        metadata,
        sender_public_key: sender.public_base64(),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        nonce: URL_SAFE_NO_PAD.encode(nonce),
    })
}

pub fn unwrap_key_ring(
    recipient: &DeviceKeyPair,
    envelope: &CryptoEnvelope,
) -> Result<KeyRing, String> {
    validate_metadata(&envelope.metadata)?;
    let sender = decode_public_key(&envelope.sender_public_key)?;
    let shared = recipient.secret.diffie_hellman(&sender);
    if shared.as_bytes().iter().all(|byte| *byte == 0) {
        return Err("Invalid sender public key.".to_owned());
    }
    let aad = authenticated_data(&envelope.metadata)?;
    let wrapping_key = derive_envelope_key(shared.as_bytes(), &aad)?;
    let ciphertext = decode_base64(&envelope.ciphertext, "Invalid envelope ciphertext.")?;
    let nonce = decode_nonce(&envelope.nonce)?;
    let plaintext = decrypt(&wrapping_key, &ciphertext, &nonce, &aad)?;
    let key_ring: KeyRing =
        serde_json::from_slice(&plaintext).map_err(|_| "Invalid encrypted key ring.".to_owned())?;
    validate_key_ring(&key_ring)?;
    Ok(key_ring)
}

pub struct RecoveryMaterial {
    root: Zeroizing<[u8; KEY_SIZE]>,
}

impl RecoveryMaterial {
    pub fn generate() -> Self {
        let mut root = Zeroizing::new([0_u8; KEY_SIZE]);
        OsRng.fill_bytes(root.as_mut());
        Self { root }
    }

    pub fn from_root(bytes: &[u8]) -> Result<Self, String> {
        let root: [u8; KEY_SIZE] = bytes
            .try_into()
            .map_err(|_| "Invalid recovery material.".to_owned())?;
        Ok(Self {
            root: Zeroizing::new(root),
        })
    }

    pub fn root_bytes(&self) -> Zeroizing<Vec<u8>> {
        Zeroizing::new(self.root.to_vec())
    }

    pub fn printable(&self, space_id: &str) -> String {
        format!(
            "{RECOVERY_PREFIX}:{space_id}:{}",
            URL_SAFE_NO_PAD.encode(self.root.as_slice())
        )
    }

    pub fn parse(value: &str) -> Result<(String, Self), String> {
        let mut parts = value.trim().split(':');
        let prefix = parts.next();
        let space_id = parts.next();
        let encoded_root = parts.next();
        if prefix != Some(RECOVERY_PREFIX)
            || space_id.is_none()
            || encoded_root.is_none()
            || parts.next().is_some()
        {
            return Err("Invalid recovery material.".to_owned());
        }
        let root = decode_base64(encoded_root.expect("checked"), "Invalid recovery material.")?;
        Ok((
            space_id.expect("checked").to_owned(),
            Self::from_root(&root)?,
        ))
    }

    pub fn auth_proof(&self) -> Result<Zeroizing<Vec<u8>>, String> {
        derive_recovery_key(&self.root, b"lifeos-recovery-auth")
    }

    pub fn verifier(&self) -> Result<Vec<u8>, String> {
        Ok(Sha256::digest(self.auth_proof()?.as_slice()).to_vec())
    }

    fn wrapping_key(&self) -> Result<Zeroizing<Vec<u8>>, String> {
        derive_recovery_key(&self.root, b"lifeos-recovery-wrap")
    }
}

pub fn encrypt_recovery_key_ring(
    material: &RecoveryMaterial,
    key_ring: &KeyRing,
    metadata: EnvelopeMetadata,
) -> Result<RecoveryEnvelope, String> {
    validate_metadata(&metadata)?;
    let aad = authenticated_data(&metadata)?;
    let plaintext = Zeroizing::new(
        serde_json::to_vec(key_ring).map_err(|_| "Key ring serialization failed.".to_owned())?,
    );
    let (ciphertext, nonce) = encrypt(&material.wrapping_key()?, &plaintext, &aad)?;
    Ok(RecoveryEnvelope {
        metadata,
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        nonce: URL_SAFE_NO_PAD.encode(nonce),
    })
}

pub fn decrypt_recovery_key_ring(
    material: &RecoveryMaterial,
    envelope: &RecoveryEnvelope,
) -> Result<KeyRing, String> {
    validate_metadata(&envelope.metadata)?;
    let aad = authenticated_data(&envelope.metadata)?;
    let ciphertext = decode_base64(&envelope.ciphertext, "Invalid recovery ciphertext.")?;
    let nonce = decode_nonce(&envelope.nonce)?;
    let plaintext = decrypt(&material.wrapping_key()?, &ciphertext, &nonce, &aad)?;
    let key_ring: KeyRing =
        serde_json::from_slice(&plaintext).map_err(|_| "Invalid encrypted key ring.".to_owned())?;
    validate_key_ring(&key_ring)?;
    Ok(key_ring)
}

pub fn encrypt_with_epoch_key(
    key_ring: &KeyRing,
    plaintext: &[u8],
    metadata: EnvelopeMetadata,
) -> Result<RecoveryEnvelope, String> {
    validate_metadata(&metadata)?;
    let key = decode_epoch_key(key_ring, metadata.key_epoch)?;
    let aad = authenticated_data(&metadata)?;
    let (ciphertext, nonce) = encrypt(&key, plaintext, &aad)?;
    Ok(RecoveryEnvelope {
        metadata,
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        nonce: URL_SAFE_NO_PAD.encode(nonce),
    })
}

pub fn decrypt_with_epoch_key(
    key_ring: &KeyRing,
    envelope: &RecoveryEnvelope,
) -> Result<Zeroizing<Vec<u8>>, String> {
    validate_metadata(&envelope.metadata)?;
    let key = decode_epoch_key(key_ring, envelope.metadata.key_epoch)?;
    let aad = authenticated_data(&envelope.metadata)?;
    let ciphertext = decode_base64(&envelope.ciphertext, "Invalid encrypted value.")?;
    let nonce = decode_nonce(&envelope.nonce)?;
    decrypt(&key, &ciphertext, &nonce, &aad)
}

pub fn encrypt_pilot_payload(
    key_ring: &KeyRing,
    plaintext: &[u8],
    metadata: PilotCryptoMetadata,
) -> Result<PilotCryptoEnvelope, String> {
    validate_pilot_metadata(&metadata)?;
    let key = decode_epoch_key(key_ring, metadata.key_epoch)?;
    let aad = serde_json::to_vec(&metadata)
        .map_err(|_| "Pilot metadata serialization failed.".to_owned())?;
    let (ciphertext, nonce) = encrypt(&key, plaintext, &aad)?;
    Ok(PilotCryptoEnvelope {
        metadata,
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        nonce: URL_SAFE_NO_PAD.encode(nonce),
    })
}

pub fn decrypt_pilot_payload(
    key_ring: &KeyRing,
    envelope: &PilotCryptoEnvelope,
) -> Result<Zeroizing<Vec<u8>>, String> {
    validate_pilot_metadata(&envelope.metadata)?;
    let key = decode_epoch_key(key_ring, envelope.metadata.key_epoch)?;
    let aad = serde_json::to_vec(&envelope.metadata)
        .map_err(|_| "Pilot metadata serialization failed.".to_owned())?;
    let ciphertext = decode_base64(&envelope.ciphertext, "Invalid pilot ciphertext.")?;
    let nonce = decode_nonce(&envelope.nonce)?;
    decrypt(&key, &ciphertext, &nonce, &aad)
}

pub fn encrypt_local_value(
    key: &[u8],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<LocalCiphertext, String> {
    if key.len() != KEY_SIZE || aad.is_empty() {
        return Err("Invalid local encryption context.".to_owned());
    }
    let (ciphertext, nonce) = encrypt(key, plaintext, aad)?;
    Ok(LocalCiphertext {
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        nonce: URL_SAFE_NO_PAD.encode(nonce),
    })
}

pub fn decrypt_local_value(
    key: &[u8],
    value: &LocalCiphertext,
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, String> {
    if key.len() != KEY_SIZE || aad.is_empty() {
        return Err("Invalid local encryption context.".to_owned());
    }
    let ciphertext = decode_base64(&value.ciphertext, "Invalid local ciphertext.")?;
    let nonce = decode_nonce(&value.nonce)?;
    decrypt(key, &ciphertext, &nonce, aad)
}

fn validate_pilot_metadata(metadata: &PilotCryptoMetadata) -> Result<(), String> {
    if metadata.protocol_version != PROTOCOL_VERSION
        || metadata.purpose != "pilot_event"
        || metadata.space_id.trim().is_empty()
        || metadata.event_id.trim().is_empty()
        || metadata.object_id.trim().is_empty()
        || metadata.origin_device_id.trim().is_empty()
        || metadata.key_epoch == 0
        || (metadata.operation != "upsert" && metadata.operation != "tombstone")
        || metadata.revision != metadata.base_revision + 1
    {
        return Err("Invalid authenticated pilot metadata.".to_owned());
    }
    Ok(())
}

fn validate_key_ring(key_ring: &KeyRing) -> Result<(), String> {
    if key_ring.keys.is_empty() {
        return Err("Key ring is empty.".to_owned());
    }
    for (epoch, encoded) in &key_ring.keys {
        if *epoch == 0 || decode_base64(encoded, "Invalid key ring.")?.len() != KEY_SIZE {
            return Err("Invalid key ring.".to_owned());
        }
    }
    Ok(())
}

fn decode_epoch_key(key_ring: &KeyRing, epoch: u32) -> Result<Zeroizing<Vec<u8>>, String> {
    let encoded = key_ring
        .keys
        .get(&epoch)
        .ok_or_else(|| "Required key epoch is unavailable.".to_owned())?;
    let decoded = decode_base64(encoded, "Invalid key ring.")?;
    if decoded.len() != KEY_SIZE {
        return Err("Invalid key ring.".to_owned());
    }
    Ok(Zeroizing::new(decoded))
}

fn validate_metadata(metadata: &EnvelopeMetadata) -> Result<(), String> {
    if metadata.protocol_version != PROTOCOL_VERSION
        || metadata.purpose.trim().is_empty()
        || metadata.space_id.trim().is_empty()
        || metadata.recipient_device_id.trim().is_empty()
        || metadata.key_epoch == 0
    {
        return Err("Invalid authenticated envelope metadata.".to_owned());
    }
    Ok(())
}

fn authenticated_data(metadata: &EnvelopeMetadata) -> Result<Vec<u8>, String> {
    serde_json::to_vec(metadata).map_err(|_| "Envelope metadata serialization failed.".to_owned())
}

fn decode_public_key(value: &str) -> Result<PublicKey, String> {
    let bytes = decode_base64(value, "Invalid device public key.")?;
    let array: [u8; KEY_SIZE] = bytes
        .try_into()
        .map_err(|_| "Invalid device public key.".to_owned())?;
    Ok(PublicKey::from(array))
}

fn derive_envelope_key(shared: &[u8; KEY_SIZE], aad: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    let hkdf = Hkdf::<Sha256>::new(Some(b"lifeos-device-envelope-v1"), shared);
    let mut key = Zeroizing::new(vec![0_u8; KEY_SIZE]);
    hkdf.expand(aad, key.as_mut_slice())
        .map_err(|_| "Envelope key derivation failed.".to_owned())?;
    Ok(key)
}

fn derive_recovery_key(
    root: &[u8; KEY_SIZE],
    purpose: &[u8],
) -> Result<Zeroizing<Vec<u8>>, String> {
    let hkdf = Hkdf::<Sha256>::new(Some(b"lifeos-recovery-v1"), root);
    let mut key = Zeroizing::new(vec![0_u8; KEY_SIZE]);
    hkdf.expand(purpose, key.as_mut_slice())
        .map_err(|_| "Recovery key derivation failed.".to_owned())?;
    Ok(key)
}

fn encrypt(
    key: &[u8],
    plaintext: &[u8],
    aad: &[u8],
) -> Result<(Vec<u8>, [u8; NONCE_SIZE]), String> {
    let cipher =
        XChaCha20Poly1305::new_from_slice(key).map_err(|_| "Invalid encryption key.".to_owned())?;
    let mut nonce = [0_u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| "Authenticated encryption failed.".to_owned())?;
    Ok((ciphertext, nonce))
}

fn decrypt(
    key: &[u8],
    ciphertext: &[u8],
    nonce: &[u8; NONCE_SIZE],
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, String> {
    let cipher =
        XChaCha20Poly1305::new_from_slice(key).map_err(|_| "Invalid encryption key.".to_owned())?;
    cipher
        .decrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| "Authenticated decryption failed.".to_owned())
}

fn decode_nonce(value: &str) -> Result<[u8; NONCE_SIZE], String> {
    decode_base64(value, "Invalid envelope nonce.")?
        .try_into()
        .map_err(|_| "Invalid envelope nonce.".to_owned())
}

fn decode_base64(value: &str, message: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| message.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync05_binary_authentication_and_retained_epoch() {
        let mut ring = new_space_key_ring().unwrap();
        for purpose in ["attachment", "snapshot"] {
            let metadata = BinaryMetadata {
                protocol_version: 1,
                purpose: purpose.into(),
                space_id: "space".into(),
                object_id: "opaque".into(),
                key_epoch: 1,
                blob_version: 1,
                snapshot_kind: if purpose == "snapshot" {
                    "manual".into()
                } else {
                    "".into()
                },
                schema_version: 1,
            };
            let a =
                encrypt_binary(&ring, b"synthetic confidential image", metadata.clone()).unwrap();
            let b = encrypt_binary(&ring, b"synthetic confidential image", metadata).unwrap();
            assert_ne!(a.nonce, b.nonce);
            assert!(!a.ciphertext.contains("synthetic"));
            assert_eq!(
                &*decrypt_binary(&ring, &a).unwrap(),
                b"synthetic confidential image"
            );
            assert!(decrypt_binary(&new_space_key_ring().unwrap(), &a).is_err());
            let mut wrong = a.clone();
            wrong.metadata.space_id = "foreign".into();
            assert!(decrypt_binary(&ring, &wrong).is_err());
            wrong = a.clone();
            wrong.metadata.blob_version = 2;
            assert!(decrypt_binary(&ring, &wrong).is_err());
            wrong = a.clone();
            wrong.ciphertext.replace_range(
                0..1,
                if a.ciphertext.starts_with('A') {
                    "B"
                } else {
                    "A"
                },
            );
            assert!(decrypt_binary(&ring, &wrong).is_err());
            rotate_key_ring(&mut ring, 2).unwrap();
            assert!(decrypt_binary(&ring, &a).is_ok());
        }
    }

    fn metadata(recipient: &str) -> EnvelopeMetadata {
        EnvelopeMetadata {
            protocol_version: PROTOCOL_VERSION,
            purpose: "pairing".to_owned(),
            space_id: "20000000-0000-4000-8000-000000000001".to_owned(),
            recipient_device_id: recipient.to_owned(),
            key_epoch: 1,
        }
    }

    #[test]
    fn x25519_devices_wrap_only_for_the_intended_recipient() {
        let sender = DeviceKeyPair::generate();
        let recipient = DeviceKeyPair::generate();
        let wrong = DeviceKeyPair::generate();
        let ring = new_space_key_ring().expect("ring");
        let envelope = wrap_key_ring(
            &sender,
            &recipient.public_base64(),
            &ring,
            metadata("30000000-0000-4000-8000-000000000002"),
        )
        .expect("wrap");
        assert_eq!(
            unwrap_key_ring(&recipient, &envelope).expect("unwrap").keys,
            ring.keys
        );
        assert!(unwrap_key_ring(&wrong, &envelope).is_err());
    }

    #[test]
    fn envelope_rejects_ciphertext_nonce_and_authenticated_metadata_tampering() {
        let sender = DeviceKeyPair::generate();
        let recipient = DeviceKeyPair::generate();
        let ring = new_space_key_ring().expect("ring");
        let envelope = wrap_key_ring(
            &sender,
            &recipient.public_base64(),
            &ring,
            metadata("30000000-0000-4000-8000-000000000002"),
        )
        .expect("wrap");

        let mut ciphertext = envelope.clone();
        ciphertext.ciphertext.push('A');
        assert!(unwrap_key_ring(&recipient, &ciphertext).is_err());
        let mut nonce = envelope.clone();
        nonce.nonce = URL_SAFE_NO_PAD.encode([0_u8; NONCE_SIZE]);
        assert!(unwrap_key_ring(&recipient, &nonce).is_err());
        for mutate in [
            |value: &mut EnvelopeMetadata| value.protocol_version = 2,
            |value: &mut EnvelopeMetadata| value.purpose = "rotation".to_owned(),
            |value: &mut EnvelopeMetadata| value.space_id.push('x'),
            |value: &mut EnvelopeMetadata| value.recipient_device_id.push('x'),
            |value: &mut EnvelopeMetadata| value.key_epoch = 2,
        ] {
            let mut changed = envelope.clone();
            mutate(&mut changed.metadata);
            assert!(unwrap_key_ring(&recipient, &changed).is_err());
        }
    }

    #[test]
    fn recovery_derivations_are_deterministic_separated_and_root_bound() {
        let root = [7_u8; KEY_SIZE];
        let material = RecoveryMaterial::from_root(&root).expect("material");
        let repeat = RecoveryMaterial::from_root(&root).expect("repeat");
        assert_eq!(
            material.auth_proof().expect("auth"),
            repeat.auth_proof().expect("auth")
        );
        assert_ne!(
            material.auth_proof().expect("auth"),
            material.wrapping_key().expect("wrap")
        );

        let ring = new_space_key_ring().expect("ring");
        let envelope = encrypt_recovery_key_ring(
            &material,
            &ring,
            EnvelopeMetadata {
                purpose: "recovery".to_owned(),
                ..metadata("30000000-0000-4000-8000-000000000001")
            },
        )
        .expect("encrypt");
        assert_eq!(
            decrypt_recovery_key_ring(&material, &envelope)
                .expect("decrypt")
                .keys,
            ring.keys
        );
        let wrong = RecoveryMaterial::from_root(&[8_u8; KEY_SIZE]).expect("wrong");
        assert!(decrypt_recovery_key_ring(&wrong, &envelope).is_err());
    }

    #[test]
    fn every_encryption_uses_a_fresh_twenty_four_byte_nonce() {
        let material = RecoveryMaterial::generate();
        let ring = new_space_key_ring().expect("ring");
        let first = encrypt_recovery_key_ring(
            &material,
            &ring,
            EnvelopeMetadata {
                purpose: "recovery".to_owned(),
                ..metadata("30000000-0000-4000-8000-000000000001")
            },
        )
        .expect("first");
        let second =
            encrypt_recovery_key_ring(&material, &ring, first.metadata.clone()).expect("second");
        assert_eq!(decode_nonce(&first.nonce).expect("nonce").len(), NONCE_SIZE);
        assert_ne!(first.nonce, second.nonce);
    }

    #[test]
    fn rotation_retry_reuses_the_persisted_epoch_key() {
        let mut ring = new_space_key_ring().expect("ring");
        rotate_key_ring(&mut ring, 2).expect("initial rotation");
        let epoch_two = ring.keys.get(&2).cloned().expect("epoch two");

        rotate_key_ring(&mut ring, 2).expect("idempotent retry");

        assert_eq!(ring.keys.get(&2), Some(&epoch_two));
        assert_eq!(ring.keys.len(), 2);
        assert!(rotate_key_ring(&mut ring, 1).is_err());
        assert!(rotate_key_ring(&mut ring, 4).is_err());
    }

    #[test]
    fn pilot_payload_binds_every_ordering_and_identity_field() {
        let ring = new_space_key_ring().expect("ring");
        let metadata = PilotCryptoMetadata {
            protocol_version: 1,
            purpose: "pilot_event".to_owned(),
            space_id: "space-1".to_owned(),
            event_id: "event-1".to_owned(),
            object_id: "object-1".to_owned(),
            origin_device_id: "device-1".to_owned(),
            key_epoch: 1,
            operation: "upsert".to_owned(),
            base_revision: 0,
            revision: 1,
            hlc_wall_time: 100,
            hlc_logical: 0,
        };
        let envelope = encrypt_pilot_payload(&ring, b"synthetic", metadata).expect("encrypt");
        assert_eq!(
            decrypt_pilot_payload(&ring, &envelope)
                .expect("decrypt")
                .as_slice(),
            b"synthetic"
        );
        let mut tampered = envelope;
        tampered.metadata.object_id = "object-2".to_owned();
        assert!(decrypt_pilot_payload(&ring, &tampered).is_err());
    }
}
