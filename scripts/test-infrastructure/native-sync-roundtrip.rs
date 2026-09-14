#[allow(dead_code)]
#[path = "../../src-tauri/src/sync_crypto.rs"]
mod sync_crypto;

use sync_crypto::{
    decrypt_pilot_payload, encrypt_pilot_payload, new_space_key_ring, PilotCryptoMetadata,
};

fn main() {
    let directory = std::env::var("LIFEOS_NATIVE_ROUNDTRIP_DIR").expect("fixture directory");
    let input = std::path::Path::new(&directory).join("input.json");
    let payloads: Vec<String> =
        serde_json::from_slice(&std::fs::read(input).expect("input")).expect("payloads");
    let ring = new_space_key_ring().expect("synthetic test keys");
    let mut output = Vec::new();
    for serialized in &payloads {
        let payload: serde_json::Value = serde_json::from_str(serialized).expect("wire JSON");
        let metadata = PilotCryptoMetadata {
            protocol_version: 1,
            purpose: "pilot_event".to_owned(),
            space_id: "synthetic-space".to_owned(),
            event_id: payload["eventId"].as_str().unwrap().to_owned(),
            object_id: payload["objectId"].as_str().unwrap().to_owned(),
            origin_device_id: "device-a".to_owned(),
            key_epoch: 1,
            operation: "upsert".to_owned(),
            base_revision: 0,
            revision: 1,
            hlc_wall_time: 100,
            hlc_logical: 0,
        };
        let first =
            encrypt_pilot_payload(&ring, serialized.as_bytes(), metadata.clone()).expect("encrypt");
        let second =
            encrypt_pilot_payload(&ring, serialized.as_bytes(), metadata).expect("encrypt again");
        assert_ne!(first.nonce, second.nonce);
        let decrypted = decrypt_pilot_payload(&ring, &first).expect("decrypt");
        assert_eq!(decrypted.as_slice(), serialized.as_bytes());
        output.push(String::from_utf8(decrypted.to_vec()).expect("UTF8"));
        let mut tampered = first;
        tampered.metadata.object_id.push_str("-tampered");
        assert!(decrypt_pilot_payload(&ring, &tampered).is_err());
    }
    std::fs::write(
        std::path::Path::new(&directory).join("output.json"),
        serde_json::to_vec(&output).unwrap(),
    )
    .expect("output");
    println!(
        "Native XChaCha20Poly1305 round-trip and authenticated metadata: {} records passed",
        output.len()
    );
}
