use crate::walk_reminder_contract::{day_index, now_millis, WalkReminderConfiguration, WalkReminderDay, WalkReminderReceipt};
use crate::windows_walk_tasks::{ComScope, WalkTasks};
use crate::windows_walk_toast;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{io::Write, os::windows::ffi::OsStrExt, path::{Path, PathBuf}};
use windows::{core::{HSTRING, PCWSTR}, Win32::{Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0, WAIT_ABANDONED},
    Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH},
    System::Threading::{CreateMutexW, ReleaseMutex, WaitForSingleObject}}};

fn queue_days<'a>(cfg: &'a WalkReminderConfiguration, now: i64, delivered: &[String]) -> Vec<&'a WalkReminderDay> {
    if !cfg.enabled { return vec![]; }
    cfg.days.iter().filter(|d| d.walk_start_at.is_some_and(|at| at > now) && !delivered.contains(&d.city_date)).take(14).collect()
}
fn dispatch_allowed(cfg: &WalkReminderConfiguration, date: &str, revision: u32, now: i64, delivered: &[String]) -> bool {
    cfg.enabled && cfg.revision == revision && !delivered.iter().any(|d| d == date) && cfg.days.iter().find(|d| d.city_date == date)
        .and_then(|d| d.walk_start_at).is_some_and(|at| now >= at && now - at <= 300000)
}
#[derive(Deserialize, Serialize)]
struct DurableCalendar { configuration: WalkReminderConfiguration, delivered: Vec<String> }
fn fence_removed(calendar: &mut DurableCalendar) { calendar.configuration.enabled = false; }
fn calendar_expired(cfg: &WalkReminderConfiguration, now: i64) -> Result<bool, String> {
    let calendar = windows::Globalization::Calendar::new().map_err(|e| e.to_string())?;
    calendar.ChangeCalendarSystem(&HSTRING::from("GregorianCalendar")).map_err(|e| e.to_string())?;
    calendar.ChangeTimeZone(&HSTRING::from(&cfg.time_zone)).map_err(|e| e.to_string())?;
    calendar.SetDateTime(windows::Foundation::DateTime { UniversalTime: (now + 11644473600000) * 10000 }).map_err(|e| e.to_string())?;
    let today = format!("{:04}-{:02}-{:02}", calendar.Year().map_err(|e| e.to_string())?, calendar.Month().map_err(|e| e.to_string())?, calendar.Day().map_err(|e| e.to_string())?);
    Ok(today > cfg.through_city_date)
}
fn directory() -> Result<PathBuf, String> {
    Ok(PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA unavailable")?).join("com.lifeos.desktop/walk-reminders-v1"))
}
fn prefix(root: &Path) -> String {
    let hash = format!("{:x}", Sha256::digest(root.to_string_lossy().to_lowercase().as_bytes()));
    format!("LifeOS-Walk-{}-", &hash[..16])
}
struct CalendarLock(HANDLE);
impl CalendarLock {
    fn acquire(root: &Path) -> Result<Self, String> {
        let name = HSTRING::from(format!("Local\\{}Mutex", prefix(root)));
        let handle = unsafe { CreateMutexW(None, false, &name) }.map_err(|e| e.to_string())?;
        let result = unsafe { WaitForSingleObject(handle, 10000) };
        if result != WAIT_OBJECT_0 && result != WAIT_ABANDONED { unsafe { let _ = CloseHandle(handle); } return Err("Walk calendar is busy".into()); }
        Ok(Self(handle))
    }
}
impl Drop for CalendarLock { fn drop(&mut self) { unsafe { let _ = ReleaseMutex(self.0); let _ = CloseHandle(self.0); } } }
fn read(root: &Path) -> Result<Option<DurableCalendar>, String> {
    let path = root.join("calendar.json");
    let file = match std::fs::File::open(path) { Ok(f) => f, Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None), Err(e) => return Err(e.to_string()) };
    if file.metadata().map_err(|e| e.to_string())?.len() > 160 * 1024 { return Err("Walk calendar is too large".into()); }
    let calendar: DurableCalendar = serde_json::from_reader(file).map_err(|e| e.to_string())?;
    calendar.configuration.validate()?;
    if calendar.delivered.len() > 400 || calendar.delivered.iter().any(|d| day_index(d).is_none()) { return Err("Invalid walk delivery ledger".into()); }
    Ok(Some(calendar))
}
fn write(root: &Path, calendar: &DurableCalendar) -> Result<(), String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let temporary = root.join("calendar.tmp");
    let mut file = std::fs::File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(calendar).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?; drop(file);
    let from: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = root.join("calendar.json").as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe { MoveFileExW(PCWSTR(from.as_ptr()), PCWSTR(to.as_ptr()), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) }.map_err(|e| e.to_string())
}
fn maintain(root: &Path, calendar: &DurableCalendar) -> Result<WalkReminderReceipt, String> {
    let cfg = &calendar.configuration;
    let now = now_millis();
    let tasks = WalkTasks::connect().map_err(|e| format!("Планировщик Windows: {e}"))?;
    let queue = queue_days(cfg, now, &calendar.delivered);
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    tasks.reconcile(&prefix(root), &executable, cfg.revision, &queue, now).map_err(|e| format!("Регистрация задач прогулки: {e}"))?;
    if !cfg.enabled { return Ok(cfg.receipt("disabled", now, None)); }
    if queue.is_empty() {
        let expired = calendar_expired(cfg, now)?;
        return Ok(cfg.receipt(if expired { "expired" } else { "error" }, now, Some(if expired { "Откройте LifeOS, чтобы продлить календарь." } else { "В сохранённом календаре больше нет будущих закатов." }.into())));
    }
    windows_walk_toast::register_identity(&executable).map_err(|e| format!("Регистрация уведомлений LifeOS: {e}"))?;
    if !windows_walk_toast::available().map_err(|e| format!("Статус уведомлений Windows: {e}"))? { return Ok(cfg.receipt("permission-required", now, Some("Разрешите уведомления LifeOS в настройках Windows.".into()))); }
    let mut receipt = cfg.receipt("scheduled", now, None);
    receipt.next_trigger_at = queue[0].walk_start_at;
    Ok(receipt)
}
#[tauri::command]
pub fn walk_reminder_reconcile(configuration: WalkReminderConfiguration) -> Result<WalkReminderReceipt, String> {
    configuration.validate()?;
    let root = directory()?; let _lock = CalendarLock::acquire(&root)?; let _com = ComScope::enter()?;
    let old = read(&root)?;
    if old.as_ref().is_some_and(|v| v.configuration.revision > configuration.revision) { return Err("Stale walk settings".into()); }
    let calendar = DurableCalendar { configuration, delivered: old.map_or_else(Vec::new, |v| v.delivered) };
    write(&root, &calendar)?;
    Ok(maintain(&root, &calendar).unwrap_or_else(|e| calendar.configuration.receipt("error", now_millis(), Some(e))))
}
#[tauri::command]
pub fn walk_reminder_status() -> Result<WalkReminderReceipt, String> {
    let root = directory()?; let _lock = CalendarLock::acquire(&root)?; let _com = ComScope::enter()?;
    match read(&root)? {
        Some(calendar) => Ok(maintain(&root, &calendar).unwrap_or_else(|e| calendar.configuration.receipt("error", now_millis(), Some(e)))),
        None => Ok(WalkReminderReceipt { revision: 0, state: "disabled".into(), next_trigger_at: None, through_city_date: None, checked_at: now_millis(), message: Some("Выберите город в LifeOS.".into()) }),
    }
}
#[tauri::command]
pub fn walk_reminder_open_settings(issue: String) -> Result<(), String> {
    if !matches!(issue.as_str(), "EXACT_ALARM" | "NOTIFICATIONS") { return Err("Unknown walk permission".into()); }
    use windows::{core::w, Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL}};
    let result = unsafe { ShellExecuteW(None, w!("open"), w!("ms-settings:notifications"), None, None, SW_SHOWNORMAL) };
    if result.0 as isize <= 32 { return Err("Не удалось открыть настройки уведомлений.".into()); }
    Ok(())
}
pub fn handle_walk_reminder_cli(args: &[String]) -> Result<bool, String> {
    let Some(mode) = args.first() else { return Ok(false); };
    if !mode.starts_with("--walk-reminder-") { return Ok(false); }
    if !matches!(mode.as_str(), "--walk-reminder-maintain" | "--walk-reminder-dispatch" | "--walk-reminder-remove") { return Err("Unknown walk reminder mode".into()); }
    let dispatch = if mode == "--walk-reminder-dispatch" {
        if args.len() != 3 || day_index(&args[1]).is_none() { return Err("Invalid walk dispatch arguments".into()); }
        Some((args[1].as_str(), args[2].parse::<u32>().map_err(|_| "Invalid walk revision")?))
    } else { if args.len() != 1 { return Err("Invalid walk reminder arguments".into()); } None };
    let root = directory()?; let _lock = CalendarLock::acquire(&root)?; let _com = ComScope::enter()?;
    if mode == "--walk-reminder-remove" {
        if let Some(mut calendar) = read(&root)? {
            fence_removed(&mut calendar);
            write(&root, &calendar)?;
        }
        WalkTasks::connect()?.remove_except(&prefix(&root), &[])?;
        windows_walk_toast::remove_identity()?;
        // Keep the local city/calendar and ledger for a future reinstall; no user data deletion.
        return Ok(true);
    }
    let Some(mut calendar) = read(&root)? else { return Ok(true); };
    if let Some((date, revision)) = dispatch {
        if dispatch_allowed(&calendar.configuration, date, revision, now_millis(), &calendar.delivered) {
            // Persist before Show to guarantee no duplicate across process restart.
            calendar.delivered.push(date.into()); calendar.delivered.sort(); calendar.delivered.dedup();
            if calendar.delivered.len() > 400 { calendar.delivered.drain(..calendar.delivered.len() - 400); }
            write(&root, &calendar)?;
            windows_walk_toast::show()?;
        }
    }
    maintain(&root, &calendar)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::walk_reminder_contract::{WalkReminderConfiguration, WalkReminderDay};
    fn calendar() -> WalkReminderConfiguration {
        WalkReminderConfiguration { schema_version: 1, revision: 2, city_id: "test".into(), time_zone: "UTC".into(), enabled: true,
            from_city_date: "2026-10-01".into(), through_city_date: "2027-11-04".into(),
            days: (1..=20).map(|i| WalkReminderDay { city_date: format!("2026-10-{i:02}"), sunset_at: Some(i * 86400000 + 900000), walk_start_at: Some(i * 86400000) }).collect() }
    }
    #[test]
    fn removed_calendar_cannot_be_dispatched_or_queued_by_waiting_processes() {
        let mut durable = DurableCalendar { configuration: calendar(), delivered: vec![] };
        fence_removed(&mut durable);
        assert!(queue_days(&durable.configuration, 0, &[]).is_empty());
        assert!(!dispatch_allowed(&durable.configuration, "2026-10-01", 2, 86400000, &[]));
    }
    #[test]
    fn expiry_follows_city_date_across_opposite_date_boundaries() {
        let _com = ComScope::enter().unwrap();
        let mut cfg = calendar(); cfg.through_city_date = "2026-10-10".into();
        let at = day_index("2026-10-10").unwrap() * 86400000 + 11 * 3600000;
        cfg.time_zone = "Pacific/Kiritimati".into();
        assert!(calendar_expired(&cfg, at).unwrap());
        cfg.time_zone = "Pacific/Honolulu".into();
        assert!(!calendar_expired(&cfg, at).unwrap());
    }
    #[test]
    fn windows_walk_queue_is_bounded_and_skips_null_past_delivered() {
        let mut cfg = calendar(); cfg.days[2].walk_start_at = None;
        let delivered = vec!["2026-10-04".into()];
        let queue = queue_days(&cfg, 2 * 86400000, &delivered);
        assert_eq!(queue.len(), 14); assert_eq!(queue[0].city_date, "2026-10-05");
        cfg.enabled = false; assert!(queue_days(&cfg, 0, &[]).is_empty());
    }
    #[test]
    fn windows_walk_dispatch_rejects_stale_disabled_duplicate_early_and_overdue() {
        let mut cfg = calendar(); let date = "2026-10-01"; let at = 86400000;
        assert!(dispatch_allowed(&cfg, date, 2, at, &[]));
        assert!(!dispatch_allowed(&cfg, date, 1, at, &[]));
        assert!(!dispatch_allowed(&cfg, date, 2, at - 1, &[]));
        assert!(!dispatch_allowed(&cfg, date, 2, at + 300001, &[]));
        assert!(!dispatch_allowed(&cfg, date, 2, at, &[date.into()]));
        assert!(!dispatch_allowed(&cfg, "2026-10-21", 2, at, &[]));
        cfg.enabled = false; assert!(!dispatch_allowed(&cfg, date, 2, at, &[]));
    }
}
