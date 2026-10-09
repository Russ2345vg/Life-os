#[cfg(target_os = "android")]
mod android_alarm;
#[cfg(target_os = "android")]
mod android_speech;
#[cfg(target_os = "android")]
mod android_today_widget;
#[cfg(target_os = "android")]
mod android_updater;
mod secure_key_store;
mod sync_commands;
mod sync_crypto;
#[cfg(target_os = "windows")]
mod windows_voice_typing;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            sync_commands::sync_auth_session_write,
            sync_commands::sync_auth_session_read,
            sync_commands::sync_auth_session_delete,
            sync_commands::sync_prepare_device_identity,
            sync_commands::sync_promote_recovery_identity,
            sync_commands::sync_delete_device_secrets,
            sync_commands::sync_prepare_first_space,
            sync_commands::sync_wrap_key_ring,
            sync_commands::sync_unwrap_and_store_key_ring,
            sync_commands::sync_prepare_recovery_authorization,
            sync_commands::sync_export_recovery_material,
            sync_commands::sync_require_recovery_material,
            sync_commands::sync_recover_and_store_key_ring,
            sync_commands::sync_encrypt_device_name,
            sync_commands::sync_decrypt_device_name,
            sync_commands::sync_encrypt_binary,
            sync_commands::sync_decrypt_binary,
            sync_commands::sync_encrypt_pilot_payload,
            sync_commands::sync_decrypt_pilot_payload,
            sync_commands::sync_encrypt_local_snapshot,
            sync_commands::sync_decrypt_local_snapshot,
            sync_commands::sync_prepare_rotation,
            sync_commands::sync_hash_pairing_secret,
            sync_commands::sync_render_pairing_qr,
            sync_commands::sync_platform,
            windows_voice_typing::windows_voice_typing_start
        ]);

    #[cfg(target_os = "android")]
    let builder = tauri::Builder::default()
        .plugin(android_updater::init())
        .plugin(android_alarm::init())
        .plugin(android_speech::init())
        .plugin(android_today_widget::init())
        .plugin(secure_key_store::android::init())
        .invoke_handler(tauri::generate_handler![
            android_updater::android_check_update,
            android_updater::android_download_and_install,
            android_speech::android_speech_recognize,
            android_today_widget::android_today_widget_update,
            android_today_widget::android_today_widget_consume_open,
            android_alarm::android_alarm_reconcile,
            android_alarm::android_alarm_status,
            android_alarm::android_alarm_list_sounds,
            android_alarm::android_alarm_schedule_test,
            android_alarm::android_alarm_open_settings,
            android_alarm::android_alarm_stop,
            android_alarm::android_alarm_dismissal_status,
            android_alarm::android_alarm_regenerate_dismissal_qr,
            android_alarm::android_alarm_export_dismissal_qr,
            android_alarm::android_alarm_save_emergency_phrase,
            sync_commands::sync_auth_session_write,
            sync_commands::sync_auth_session_read,
            sync_commands::sync_auth_session_delete,
            sync_commands::sync_prepare_device_identity,
            sync_commands::sync_promote_recovery_identity,
            sync_commands::sync_delete_device_secrets,
            sync_commands::sync_prepare_first_space,
            sync_commands::sync_wrap_key_ring,
            sync_commands::sync_unwrap_and_store_key_ring,
            sync_commands::sync_prepare_recovery_authorization,
            sync_commands::sync_export_recovery_material,
            sync_commands::sync_require_recovery_material,
            sync_commands::sync_recover_and_store_key_ring,
            sync_commands::sync_encrypt_device_name,
            sync_commands::sync_decrypt_device_name,
            sync_commands::sync_encrypt_binary,
            sync_commands::sync_decrypt_binary,
            sync_commands::sync_encrypt_pilot_payload,
            sync_commands::sync_decrypt_pilot_payload,
            sync_commands::sync_encrypt_local_snapshot,
            sync_commands::sync_decrypt_local_snapshot,
            sync_commands::sync_prepare_rotation,
            sync_commands::sync_hash_pairing_secret,
            sync_commands::sync_render_pairing_qr,
            sync_commands::sync_platform
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("failed to run LifeOS application");
}
