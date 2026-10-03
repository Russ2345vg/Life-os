use super::SecretId;
use std::ffi::OsStr;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};
use windows_sys::Win32::Storage::FileSystem::{
    MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
};
use zeroize::{Zeroize, Zeroizing};

const MAX_PROTECTED_BYTES: u64 = 2 * 1024 * 1024;

pub fn store<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
    value: &[u8],
) -> Result<(), String> {
    let directory = secure_directory(app)?;
    let protected = protect(value)?;
    write_atomic(&directory, &id.storage_name(), &protected)
}

pub fn load<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &SecretId,
) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
    let path = secure_directory(app)?.join(id.storage_name());
    load_path(&path)
}

pub fn promote_recovery_identity<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    target: &SecretId,
    candidate: &SecretId,
) -> Result<(), String> {
    if target.storage_name() == candidate.storage_name() {
        return Err("Recovery identity must use a separate candidate.".to_owned());
    }
    let private = load(app, candidate)?
        .ok_or_else(|| "Recovery candidate private key is unavailable.".to_owned())?;
    let directory = secure_directory(app)?;
    replace_unreadable_path(&directory, &target.storage_name(), private.as_slice())
}

fn replace_unreadable_path(directory: &Path, name: &str, candidate: &[u8]) -> Result<(), String> {
    let target = directory.join(name);
    match load_path(&target) {
        Ok(Some(existing)) if existing.as_slice() == candidate => return Ok(()),
        Ok(Some(_)) => return Err("Existing device private key is still available.".to_owned()),
        Ok(None) => {}
        Err(reason) if reason == "Windows secure storage decryption failed." => {
            backup_unreadable_path(&target)?;
        }
        Err(reason) => return Err(reason),
    }
    let protected = protect(candidate)?;
    write_atomic(directory, name, &protected)
}

fn backup_unreadable_path(path: &Path) -> Result<(), String> {
    let protected = fs::read(path).map_err(|_| "Secure storage backup read failed.".to_owned())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Secure storage backup timestamp is unavailable.".to_owned())?
        .as_nanos();
    let backup_name = format!(
        "{}.unreadable-{}-{stamp}.bak",
        path.file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Secure storage backup path is unavailable.".to_owned())?,
        std::process::id()
    );
    let mut backup = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path.with_file_name(backup_name))
        .map_err(|_| "Secure storage backup creation failed.".to_owned())?;
    backup
        .write_all(&protected)
        .map_err(|_| "Secure storage backup write failed.".to_owned())?;
    backup
        .sync_all()
        .map_err(|_| "Secure storage backup flush failed.".to_owned())
}

pub fn delete<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &SecretId) -> Result<(), String> {
    let path = secure_directory(app)?.join(id.storage_name());
    delete_path(&path)
}

fn delete_path(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Secure storage delete failed.".to_owned()),
    }
}

fn secure_directory<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Secure storage path is unavailable.".to_owned())?
        .join("sync-secure");
    fs::create_dir_all(&directory)
        .map_err(|_| "Secure storage directory is unavailable.".to_owned())?;
    Ok(directory)
}

fn load_path(path: &Path) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Secure storage metadata is unavailable.".to_owned()),
    };
    if metadata.len() == 0 || metadata.len() > MAX_PROTECTED_BYTES {
        return Err("Secure storage data is invalid.".to_owned());
    }
    let protected = fs::read(path).map_err(|_| "Secure storage read failed.".to_owned())?;
    unprotect(&protected).map(Some)
}

fn protect(value: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    if value.is_empty() || value.len() > MAX_PROTECTED_BYTES as usize {
        return Err("Secure storage input is invalid.".to_owned());
    }
    let input = CRYPT_INTEGER_BLOB {
        cbData: value.len() as u32,
        pbData: value.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let success = unsafe {
        CryptProtectData(
            &input,
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if success == 0 || output.pbData.is_null() {
        return Err("Windows secure storage encryption failed.".to_owned());
    }
    let protected = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let result = Zeroizing::new(protected.to_vec());
    unsafe {
        LocalFree(output.pbData.cast());
    }
    Ok(result)
}

fn unprotect(value: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: value.len() as u32,
        pbData: value.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    let success = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if success == 0 || output.pbData.is_null() {
        return Err("Windows secure storage decryption failed.".to_owned());
    }
    let plaintext = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let result = Zeroizing::new(plaintext.to_vec());
    unsafe {
        std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize).zeroize();
        LocalFree(output.pbData.cast());
    }
    Ok(result)
}

fn write_atomic(directory: &Path, name: &str, value: &[u8]) -> Result<(), String> {
    let target = directory.join(name);
    let temporary = directory.join(format!(".{name}.{}.tmp", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|_| "Secure storage temporary file creation failed.".to_owned())?;
    let result = (|| {
        file.write_all(value)
            .map_err(|_| "Secure storage write failed.".to_owned())?;
        file.sync_all()
            .map_err(|_| "Secure storage flush failed.".to_owned())?;
        drop(file);
        replace_file(&temporary, &target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn replace_file(source: &Path, target: &Path) -> Result<(), String> {
    let source_wide = wide(source.as_os_str());
    let target_wide = wide(target.as_os_str());
    let success = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if success == 0 {
        Err("Secure storage atomic replace failed.".to_owned())
    } else {
        Ok(())
    }
}

fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::{
        delete_path, load_path, protect, replace_unreadable_path, unprotect, write_atomic,
    };
    use std::fs;

    #[test]
    fn dpapi_round_trip_is_user_scoped_and_tampering_fails_closed() {
        let plaintext = b"synthetic-dpapi-secret";
        let protected = protect(plaintext).expect("protect");
        assert_ne!(protected.as_slice(), plaintext);
        assert_eq!(
            unprotect(&protected).expect("unprotect").as_slice(),
            plaintext
        );

        let mut corrupted = protected.to_vec();
        let middle = corrupted.len() / 2;
        corrupted[middle] ^= 0x80;
        assert!(unprotect(&corrupted).is_err());
    }

    #[test]
    fn protected_file_persists_and_never_contains_plaintext() {
        let directory =
            std::env::temp_dir().join(format!("lifeos-dpapi-test-{}", std::process::id()));
        fs::create_dir_all(&directory).expect("directory");
        let plaintext = b"synthetic-restart-secret";
        let protected = protect(plaintext).expect("protect");
        write_atomic(&directory, "slot", &protected).expect("write");
        let bytes = fs::read(directory.join("slot")).expect("read file");
        assert!(!bytes
            .windows(plaintext.len())
            .any(|window| window == plaintext));
        assert_eq!(
            load_path(&directory.join("slot"))
                .expect("load")
                .expect("present")
                .as_slice(),
            plaintext
        );
        let replacement = b"synthetic-replacement-secret";
        let replacement_protected = protect(replacement).expect("protect replacement");
        write_atomic(&directory, "slot", &replacement_protected).expect("overwrite");
        assert_eq!(
            load_path(&directory.join("slot"))
                .expect("load replacement")
                .expect("replacement present")
                .as_slice(),
            replacement
        );
        let unreadable = protected.to_vec();
        let middle = unreadable.len() / 2;
        let mut unreadable = unreadable;
        unreadable[middle] ^= 0x80;
        write_atomic(&directory, "unreadable", &unreadable).expect("unreadable slot");
        replace_unreadable_path(&directory, "unreadable", replacement)
            .expect("promote recovery key");
        assert_eq!(
            load_path(&directory.join("unreadable"))
                .expect("promoted slot")
                .expect("present")
                .as_slice(),
            replacement
        );
        let backup = fs::read_dir(&directory)
            .expect("backup directory")
            .filter_map(Result::ok)
            .find(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("unreadable.unreadable-")
            })
            .expect("old protected key backup");
        assert_eq!(fs::read(backup.path()).expect("backup"), unreadable);
        assert!(replace_unreadable_path(&directory, "slot", b"different key").is_err());
        delete_path(&directory.join("slot")).expect("delete");
        assert!(load_path(&directory.join("slot"))
            .expect("missing")
            .is_none());
        delete_path(&directory.join("slot")).expect("idempotent delete");
        fs::remove_dir_all(directory).expect("cleanup");
    }

    #[test]
    fn sync_delete_device_secrets_missing_slots_are_idempotent() {
        let missing = std::env::temp_dir().join(format!(
            "lifeos-missing-device-secret-{}",
            std::process::id()
        ));
        let _ = fs::remove_file(&missing);
        delete_path(&missing).expect("first missing delete");
        delete_path(&missing).expect("repeated missing delete");
    }
}
