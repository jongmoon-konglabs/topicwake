use rusqlite::{Connection, MAIN_DB, OpenFlags};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn prepare_database(
    directory: &Path,
    source: Option<&Path>,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if !directory.is_absolute() {
        return Err("The app data folder must use an absolute path.".into());
    }
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(directory)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(directory)?.permissions().mode() & 0o077 != 0 {
            return Err(
                "The app data folder must be private to your account. Check its permissions."
                    .into(),
            );
        }
    }
    let destination = directory.join("zenoh-admin.sqlite3");
    if destination.exists() {
        if source.is_some() {
            let existing =
                Connection::open_with_flags(&destination, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let users =
                existing.query_row("SELECT COUNT(*) FROM users", [], |row| row.get::<_, u64>(0))?;
            if users == 0 {
                return Err("An app database already exists. The account was not imported, and no data was overwritten.".into());
            }
        }
        return Ok(destination);
    }
    let Some(source) = source else {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        drop(options.open(&destination)?);
        return Ok(destination);
    };
    let source = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let temporary = directory.join(format!(
        ".import-{}.sqlite3",
        hex::encode(rand::random::<[u8; 16]>())
    ));
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        drop(options.open(&temporary)?);
        source.backup(MAIN_DB, &temporary, None)?;
        let imported = Connection::open(&temporary)?;
        imported.query_row("SELECT COUNT(*) FROM users", [], |row| row.get::<_, u64>(0))?;
        // Imported passwords remain valid, but browser sessions never cross into the app.
        imported.execute("DELETE FROM sessions", [])?;
        imported.execute_batch("PRAGMA journal_mode=DELETE;")?;
        drop(imported);
        // hard_link fails rather than replacing a database created by another first launch.
        fs::hard_link(&temporary, &destination)?;
        Ok(())
    })();
    let _ = fs::remove_file(&temporary);
    result?;
    Ok(destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "zenoh-app-test-{}",
            hex::encode(rand::random::<[u8; 8]>())
        ))
    }
    #[test]
    fn imports_live_wal_without_touching_original_or_preserving_sessions() {
        let root = directory();
        fs::create_dir_all(&root).unwrap();
        let source_path = root.join("source.sqlite3");
        let source = Connection::open(&source_path).unwrap();
        source.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE users(username TEXT,password TEXT); CREATE TABLE sessions(token TEXT); INSERT INTO users VALUES('admin','hash'); INSERT INTO sessions VALUES('token');").unwrap();
        let target = prepare_database(&root.join("app"), Some(&source_path)).unwrap();
        let imported = Connection::open(&target).unwrap();
        assert_eq!(
            imported
                .query_row("SELECT password FROM users", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "hash"
        );
        assert_eq!(
            imported
                .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get::<_, u64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            source
                .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get::<_, u64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            prepare_database(&root.join("app"), Some(Path::new("/missing"))).unwrap(),
            target
        );
        drop(imported);
        drop(source);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn refuses_shared_existing_directory_without_changing_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let root = directory();
        fs::create_dir(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o755)).unwrap();
        assert!(prepare_database(&root, None).is_err());
        assert_eq!(
            fs::metadata(&root).unwrap().permissions().mode() & 0o777,
            0o755
        );
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn new_database_is_private_and_unrelated_files_are_preserved() {
        let root = directory();
        let target = prepare_database(&root, None).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&target).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        let stale = root.join(".import-interrupted.sqlite3");
        fs::write(&stale, "partial").unwrap();
        assert_eq!(prepare_database(&root, None).unwrap(), target);
        assert!(stale.exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn explicit_import_never_overwrites_existing_empty_app_database() {
        let root = directory();
        let app = root.join("app");
        let target = prepare_database(&app, None).unwrap();
        let existing = Connection::open(&target).unwrap();
        existing.execute_batch("CREATE TABLE users(username TEXT,password TEXT); CREATE TABLE sessions(token TEXT);").unwrap();
        let source = root.join("source.sqlite3");
        let original = Connection::open(&source).unwrap();
        original.execute_batch("CREATE TABLE users(username TEXT,password TEXT); CREATE TABLE sessions(token TEXT); INSERT INTO users VALUES('admin','hash');").unwrap();
        assert!(prepare_database(&app, Some(&source)).is_err());
        assert_eq!(
            existing
                .query_row("SELECT COUNT(*) FROM users", [], |r| r.get::<_, u64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            original
                .query_row("SELECT COUNT(*) FROM users", [], |r| r.get::<_, u64>(0))
                .unwrap(),
            1
        );
        drop(existing);
        drop(original);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn invalid_import_aborts_without_creating_empty_destination() {
        let root = directory();
        assert!(prepare_database(&root, Some(Path::new("/missing/zenoh.sqlite3"))).is_err());
        assert!(!root.join("zenoh-admin.sqlite3").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
