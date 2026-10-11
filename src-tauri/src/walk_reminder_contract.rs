use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WalkReminderDay {
    pub city_date: String,
    pub sunset_at: Option<i64>,
    pub walk_start_at: Option<i64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WalkReminderConfiguration {
    pub schema_version: u32,
    pub revision: u32,
    pub city_id: String,
    pub time_zone: String,
    pub enabled: bool,
    pub from_city_date: String,
    pub through_city_date: String,
    pub days: Vec<WalkReminderDay>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalkReminderReceipt {
    pub revision: u32,
    pub state: String,
    pub next_trigger_at: Option<i64>,
    pub through_city_date: Option<String>,
    pub checked_at: i64,
    pub message: Option<String>,
}
impl WalkReminderConfiguration {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 || self.revision == 0 || self.city_id.is_empty() || self.city_id.len() > 200 ||
            self.time_zone.is_empty() || self.time_zone.len() > 200 || self.days.len() != 400 {
            return Err("Invalid walk reminder configuration".into());
        }
        if serde_json::to_vec(self).map_err(|e| e.to_string())?.len() > 128 * 1024 {
            return Err("Walk reminder calendar is too large".into());
        }
        let start = day_index(&self.from_city_date).ok_or("Invalid first city date")?;
        if day_index(&self.through_city_date) != Some(start + 399) { return Err("Invalid calendar coverage".into()); }
        let mut previous = None;
        for (offset, day) in self.days.iter().enumerate() {
            let date = day_index(&day.city_date).ok_or("Invalid city date")?;
            if date != start + offset as i64 { return Err("Calendar dates must be continuous".into()); }
            match (day.sunset_at, day.walk_start_at) {
                (None, None) => {},
                (Some(sunset), Some(walk)) if sunset > 0 && walk > 0 && sunset % 60000 == 0 && walk % 60000 == 0 && sunset.checked_sub(walk) == Some(900000) &&
                    (sunset / 86400000 - date).abs() <= 2 && previous.map_or(true, |p| walk > p) => { previous = Some(walk); },
                _ => return Err("Invalid sunset reminder instant".into()),
            }
        }
        Ok(())
    }
    pub fn next_after(&self, now: i64) -> Option<&WalkReminderDay> {
        if !self.enabled { return None; }
        self.days.iter().find(|day| day.walk_start_at.is_some_and(|at| at > now))
    }
    pub fn receipt(&self, state: &str, now: i64, message: Option<String>) -> WalkReminderReceipt {
        WalkReminderReceipt { revision: self.revision, state: state.into(), next_trigger_at: if state == "scheduled" { self.next_after(now).and_then(|d| d.walk_start_at) } else { None },
            through_city_date: Some(self.through_city_date.clone()), checked_at: now, message }
    }
}
pub fn now_millis() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}
pub fn day_index(date: &str) -> Option<i64> {
    let bytes = date.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' ||
        bytes.iter().enumerate().any(|(i, c)| i != 4 && i != 7 && !c.is_ascii_digit()) { return None; }
    let mut year: i64 = date[0..4].parse().ok()?;
    let month: i64 = date[5..7].parse().ok()?;
    let day: i64 = date[8..10].parse().ok()?;
    if !(1..=9999).contains(&year) || !(1..=12).contains(&month) { return None; }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let limit = match month { 2 => if leap { 29 } else { 28 }, 4 | 6 | 9 | 11 => 30, _ => 31 };
    if day < 1 || day > limit { return None; }
    year -= if month <= 2 { 1 } else { 0 };
    let era = year.div_euclid(400);
    let yoe = year - era * 400;
    let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    Some(era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468)
}
pub fn date_from_day_index(index: i64) -> String {
    let z = index + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    format!("{year:04}-{month:02}-{day:02}")
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> WalkReminderConfiguration {
        let from = day_index("2026-10-11").unwrap();
        WalkReminderConfiguration { schema_version: 1, revision: 1, city_id: "2026126".into(), time_zone: "Asia/Chita".into(), enabled: true,
            from_city_date: "2026-10-11".into(), through_city_date: date_from_day_index(from + 399),
            days: (0..400).map(|offset| WalkReminderDay { city_date: date_from_day_index(from + offset),
                sunset_at: Some((from + offset) * 86400000 + 34260000), walk_start_at: Some((from + offset) * 86400000 + 33360000) }).collect() }
    }
    #[test]
    fn validates_a_contiguous_400_date_calendar_and_json_roundtrip() {
        let value = fixture(); assert!(value.validate().is_ok());
        let json = serde_json::to_string(&value).unwrap();
        assert!(serde_json::from_str::<WalkReminderConfiguration>(&json).unwrap().validate().is_ok());
    }
    #[test]
    fn rejects_bad_offset_duplicate_dates_and_oversized_payloads() {
        let mut bad = fixture(); bad.days[0].walk_start_at = bad.days[0].sunset_at; assert!(bad.validate().is_err());
        let mut bad = fixture(); bad.days[1].city_date = bad.days[0].city_date.clone(); assert!(bad.validate().is_err());
        let mut bad = fixture(); bad.city_id = "x".repeat(140000); assert!(bad.validate().is_err());
        let mut bad = fixture(); bad.schema_version = 2; assert!(bad.validate().is_err());
    }
    #[test]
    fn selects_only_future_valid_instants_and_preserves_no_sunset() {
        let mut value = fixture(); let first = value.days[0].walk_start_at.unwrap();
        value.days[1].sunset_at = None; value.days[1].walk_start_at = None;
        assert!(value.validate().is_ok());
        assert_eq!(value.next_after(first).unwrap().city_date, value.days[2].city_date);
        assert!(value.next_after(i64::MAX).is_none());
    }
}
