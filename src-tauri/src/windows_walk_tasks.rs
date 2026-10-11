use std::path::Path;
use windows::{core::BSTR, Win32::System::{Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED}, TaskScheduler::*, Variant::VARIANT}};
use crate::walk_reminder_contract::{date_from_day_index, WalkReminderDay};

pub struct ComScope(bool);
impl ComScope {
    pub fn enter() -> Result<Self, String> {
        let result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        // A Tauri UI thread can already use STA. COM is still available on that thread.
        if result.0 == 0x80010106u32 as i32 { return Ok(Self(false)); }
        result.ok().map_err(|e| e.to_string())?;
        Ok(Self(true))
    }
}
impl Drop for ComScope { fn drop(&mut self) { if self.0 { unsafe { CoUninitialize(); } } } }

pub fn escape_xml(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}
fn timestamp(at: i64) -> String {
    let seconds = at.div_euclid(1000).rem_euclid(86400);
    format!("{}T{:02}:{:02}:{:02}Z", date_from_day_index(at.div_euclid(86400000)), seconds / 3600, seconds / 60 % 60, seconds % 60)
}

pub struct WalkTasks { folder: ITaskFolder, user: String }
impl WalkTasks {
    pub fn connect() -> Result<Self, String> {
        unsafe {
            let service: ITaskService = CoCreateInstance(&TaskScheduler, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
            let empty = VARIANT::default();
            service.Connect(&empty, &empty, &empty, &empty).map_err(|e| e.to_string())?;
            let user = format!("{}\\{}", service.ConnectedDomain().map_err(|e| e.to_string())?, service.ConnectedUser().map_err(|e| e.to_string())?);
            Ok(Self { folder: service.GetFolder(&BSTR::from("\\")).map_err(|e| e.to_string())?, user })
        }
    }
    fn register(&self, name: &str, executable: &Path, args: &str, triggers: &str, missed: bool) -> Result<(), String> {
        let path = executable.to_str().ok_or("Invalid executable path")?;
        let user = escape_xml(&self.user);
        let xml = format!(r#"<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Author>LifeOS</Author><Description>Прогулка перед закатом</Description></RegistrationInfo><Triggers>{triggers}</Triggers><Principals><Principal id="User"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>{missed}</StartWhenAvailable><Enabled>true</Enabled><ExecutionTimeLimit>PT2M</ExecutionTimeLimit></Settings><Actions Context="User"><Exec><Command>{}</Command><Arguments>{}</Arguments></Exec></Actions></Task>"#, escape_xml(path), escape_xml(args));
        unsafe { self.folder.RegisterTask(&BSTR::from(name), &BSTR::from(xml), TASK_CREATE_OR_UPDATE.0,
            &VARIANT::from(self.user.as_str()), &VARIANT::default(), TASK_LOGON_INTERACTIVE_TOKEN, &VARIANT::default()) }.map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn reconcile(&self, prefix: &str, executable: &Path, revision: u32, days: &[&WalkReminderDay], now: i64) -> Result<(), String> {
        let mut names = Vec::new();
        for day in days {
            let name = format!("{prefix}{}", day.city_date);
            let trigger = format!("<TimeTrigger><StartBoundary>{}</StartBoundary><Enabled>true</Enabled></TimeTrigger>", timestamp(day.walk_start_at.ok_or("Missing walk time")?));
            self.register(&name, executable, &format!("--walk-reminder-dispatch {} {revision}", day.city_date), &trigger, false)?;
            names.push(name);
        }
        if !days.is_empty() {
            let name = format!("{prefix}Maintain");
            let triggers = format!("<CalendarTrigger><StartBoundary>{}</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger><LogonTrigger><Enabled>true</Enabled><UserId>{}</UserId></LogonTrigger>", timestamp(now + 86400000), escape_xml(&self.user));
            self.register(&name, executable, "--walk-reminder-maintain", &triggers, true)?;
            names.push(name);
        }
        self.remove_except(prefix, &names)?;
        for name in names {
            let task = unsafe { self.folder.GetTask(&BSTR::from(name)) }.map_err(|e| e.to_string())?;
            if !unsafe { task.Enabled() }.map_err(|e| e.to_string())?.as_bool() { return Err("Walk task is disabled".into()); }
        }
        Ok(())
    }
    pub fn remove_except(&self, prefix: &str, keep: &[String]) -> Result<(), String> {
        unsafe {
            let tasks = self.folder.GetTasks(TASK_ENUM_HIDDEN.0).map_err(|e| e.to_string())?;
            let mut remove = Vec::new();
            for i in 1..=tasks.Count().map_err(|e| e.to_string())? {
                let name = tasks.get_Item(&VARIANT::from(i)).and_then(|t| t.Name()).map_err(|e| e.to_string())?.to_string();
                if name.starts_with(prefix) && !keep.contains(&name) { remove.push(name); }
            }
            for name in remove { self.folder.DeleteTask(&BSTR::from(name), 0).map_err(|e| e.to_string())?; }
        }
        Ok(())
    }
}
