use std::path::{Path, PathBuf};
use windows::{core::{w, HSTRING, Interface, PCWSTR}, Data::Xml::Dom::XmlDocument,
    UI::Notifications::{NotificationSetting, ToastNotification, ToastNotificationManager},
    Win32::{Foundation::PROPERTYKEY, System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, StructuredStorage::PROPVARIANT},
        UI::Shell::{IShellLinkW, ShellLink, PropertiesSystem::IPropertyStore}}};
const AUMID: &str = "com.lifeos.desktop.walk";
fn shortcut() -> Result<PathBuf, String> {
    let roaming = std::env::var_os("APPDATA").ok_or("APPDATA unavailable")?;
    Ok(PathBuf::from(roaming).join("Microsoft/Windows/Start Menu/Programs/LifeOS Walk Reminder.lnk"))
}
pub fn register_identity(executable: &Path) -> Result<(), String> {
    let target = shortcut()?;
    std::fs::create_dir_all(target.parent().ok_or("Invalid shortcut")?).map_err(|e| e.to_string())?;
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
        let exe: Vec<u16> = executable.as_os_str().encode_wide().chain(Some(0)).collect();
        link.SetPath(PCWSTR(exe.as_ptr())).map_err(|e| e.to_string())?;
        link.SetDescription(w!("LifeOS — прогулка перед закатом")).map_err(|e| e.to_string())?;
        let store: IPropertyStore = link.cast().map_err(|e| e.to_string())?;
        let key = PROPERTYKEY { fmtid: windows::core::GUID::from_u128(0x9f4c2855_9f79_4b39_a8d0_e1d42de1d5f3), pid: 5 };
        store.SetValue(&key, &PROPVARIANT::from(AUMID)).map_err(|e| e.to_string())?;
        store.Commit().map_err(|e| e.to_string())?;
        let persist: IPersistFile = link.cast().map_err(|e| e.to_string())?;
        let path: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
        persist.Save(PCWSTR(path.as_ptr()), true).map_err(|e| e.to_string())?;
    }
    Ok(())
}
use std::os::windows::ffi::OsStrExt;
pub fn available() -> Result<bool, String> {
    available_for_id(AUMID)
}
fn available_for_id(aumid: &str) -> Result<bool, String> {
    let id = HSTRING::from(aumid);
    let notifier = ToastNotificationManager::CreateToastNotifierWithId(&id).map_err(|e| e.to_string())?;
    let setting = match notifier.Setting() {
        Ok(setting) => setting,
        // Identity-less desktop apps have no notification settings until their first toast.
        // Match Microsoft's PreRegisterIdentityLessApp: a suppressed, short-lived toast,
        // removed immediately, then query the actual setting. Never assume permission.
        Err(error) if error.code().0 == 0x80070490u32 as i32 => {
            let doc = XmlDocument::new().map_err(|e| e.to_string())?;
            doc.LoadXml(&HSTRING::from("<toast><visual><binding template=\"ToastGeneric\"><text>LifeOS</text></binding></visual></toast>")).map_err(|e| e.to_string())?;
            let toast = ToastNotification::CreateToastNotification(&doc).map_err(|e| e.to_string())?;
            let tag = HSTRING::from("walk-registration");
            let group = HSTRING::from("registration");
            toast.SetSuppressPopup(true).map_err(|e| e.to_string())?;
            toast.SetTag(&tag).map_err(|e| e.to_string())?;
            toast.SetGroup(&group).map_err(|e| e.to_string())?;
            let expiry: windows::Foundation::IReference<windows::Foundation::DateTime> =
                windows::Foundation::PropertyValue::CreateDateTime(windows::Foundation::DateTime {
                    UniversalTime: (crate::walk_reminder_contract::now_millis() + 11644473600000 + 15000) * 10000,
                }).and_then(|v| v.cast()).map_err(|e| e.to_string())?;
            toast.SetExpirationTime(&expiry).map_err(|e| e.to_string())?;
            notifier.Show(&toast).map_err(|e| e.to_string())?;
            ToastNotificationManager::History().and_then(|h| h.RemoveGroupedTagWithId(&tag, &group, &id)).map_err(|e| e.to_string())?;
            notifier.Setting().map_err(|e| e.to_string())?
        }
        Err(error) => return Err(error.to_string()),
    };
    Ok(setting == NotificationSetting::Enabled)
}
pub fn show() -> Result<(), String> {
    if !available()? { return Err("Разрешите уведомления LifeOS в настройках Windows.".into()); }
    let doc = XmlDocument::new().map_err(|e| e.to_string())?;
    doc.LoadXml(&HSTRING::from("<toast><visual><binding template=\"ToastGeneric\"><text>Пора на прогулку</text><text>До заката 15 минут. Хорошей прогулки!</text></binding></visual></toast>")).map_err(|e| e.to_string())?;
    let toast = ToastNotification::CreateToastNotification(&doc).map_err(|e| e.to_string())?;
    toast.SetTag(&HSTRING::from("sunset-walk")).map_err(|e| e.to_string())?;
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(AUMID)).and_then(|n| n.Show(&toast)).map_err(|e| e.to_string())
}
pub fn remove_identity() -> Result<(), String> {
    // Remove only this reminder's history; other LifeOS notifications are unrelated.
    if let Ok(history) = ToastNotificationManager::History() { let _ = history.ClearWithId(&HSTRING::from(AUMID)); }
    match std::fs::remove_file(shortcut()?) { Ok(()) => Ok(()), Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(e) => Err(e.to_string()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Opt-in Windows notification integration: creates an owned, suppressed QA toast"]
    fn first_use_registers_before_reading_actual_notification_settings() {
        let _com = crate::windows_walk_tasks::ComScope::enter().unwrap();
        let aumid = format!("com.lifeos.walk.qa.{}.{}", std::process::id(), crate::walk_reminder_contract::now_millis());
        let id = HSTRING::from(&aumid);
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&id).unwrap();
        assert_eq!(notifier.Setting().unwrap_err().code().0, 0x80070490u32 as i32);
        let result = available_for_id(&aumid);
        let history = ToastNotificationManager::History().unwrap();
        let remaining = history.GetHistoryWithId(&id).and_then(|v| v.Size());
        let _ = history.ClearWithId(&id);
        assert!(result.unwrap(), "QA notifications must be enabled in the test environment");
        assert_eq!(remaining.unwrap(), 0, "registration must not leave a visible or history toast");
    }
}
