use crate::AppState;
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use rand::RngCore;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

pub struct Auth {
    db: Mutex<Connection>,
    last_attempt: Mutex<Option<std::time::Instant>>,
    hash_slot: tokio::sync::Semaphore,
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
impl Auth {
    pub fn open(path: &str) -> rusqlite::Result<Self> {
        let db = Connection::open(path)?;
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY,password TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,username TEXT NOT NULL,expires INTEGER NOT NULL);")?;
        Ok(Self {
            db: Mutex::new(db),
            last_attempt: Mutex::new(None),
            hash_slot: tokio::sync::Semaphore::new(1),
        })
    }
    fn attempt(&self) -> Result<(), StatusCode> {
        let mut last = self
            .last_attempt
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if last.is_some_and(|t| t.elapsed() < std::time::Duration::from_secs(2)) {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        *last = Some(std::time::Instant::now());
        Ok(())
    }
    pub fn username(&self, headers: &HeaderMap) -> Result<Option<String>, StatusCode> {
        let Some(token) = cookie(headers) else {
            return Ok(None);
        };
        self.db
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .query_row(
                "SELECT username FROM sessions WHERE token=?1 AND expires>?2",
                params![token, now()],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}
fn cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("cookie")?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|c| c.trim().strip_prefix("zenoh_session="))
}
#[derive(Deserialize)]
pub struct Credentials {
    username: String,
    password: String,
}
type Reply = Result<(HeaderMap, Json<Value>), StatusCode>;
fn session(auth: &Auth, username: &str) -> Reply {
    let mut random = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut random);
    let token = hex::encode(random);
    let db = auth
        .db
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    db.execute("DELETE FROM sessions WHERE expires<=?1", [now()])
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    db.execute(
        "INSERT INTO sessions VALUES(?1,?2,?3)",
        params![token, username, now() + 8 * 3600],
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut headers = HeaderMap::new();
    headers.insert(
        "set-cookie",
        format!("zenoh_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800")
            .parse()
            .unwrap(),
    );
    Ok((headers, Json(json!({"username":username}))))
}
pub async fn status(State(s): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let count: i64 = s
        .auth
        .db
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({"setup_required": count == 0})))
}
pub async fn setup(State(s): State<AppState>, Json(c): Json<Credentials>) -> Reply {
    s.auth.attempt()?;
    let _slot = s
        .auth
        .hash_slot
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    if c.username.is_empty()
        || c.username.len() > 64
        || !c
            .username
            .chars()
            .all(|v| v.is_ascii_alphanumeric() || "_-".contains(v))
        || c.password.chars().count() < 4
        || c.password.len() > 256
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let password = c.password.clone();
    let hash = tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
            .map(|h| h.to_string())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;
    {
        let mut db = s
            .auth
            .db
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let tx = db
            .transaction()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let count: i64 = tx
            .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if count > 0 {
            return Err(StatusCode::CONFLICT);
        }
        tx.execute("INSERT INTO users VALUES(?1,?2)", params![c.username, hash])
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        tx.commit().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    session(&s.auth, &c.username)
}
pub async fn login(State(s): State<AppState>, Json(c): Json<Credentials>) -> Reply {
    s.auth.attempt()?;
    let _slot = s
        .auth
        .hash_slot
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    if c.username.len() > 64 || c.password.len() > 256 {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let hash: Option<String> = s
        .auth
        .db
        .lock()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .query_row(
            "SELECT password FROM users WHERE username=?1",
            [&c.username],
            |r| r.get(0),
        )
        .optional()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let hash = hash.ok_or(StatusCode::UNAUTHORIZED)?;
    let password = c.password.clone();
    tokio::task::spawn_blocking(move || {
        let parsed = PasswordHash::new(&hash).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| StatusCode::UNAUTHORIZED)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)??;
    session(&s.auth, &c.username)
}
pub async fn me(State(s): State<AppState>, h: HeaderMap) -> Result<Json<Value>, StatusCode> {
    s.auth
        .username(&h)?
        .map(|u| Json(json!({"username":u})))
        .ok_or(StatusCode::UNAUTHORIZED)
}
pub async fn logout(State(s): State<AppState>, h: HeaderMap) -> Reply {
    if let Some(token) = cookie(&h) {
        s.auth
            .db
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .execute("DELETE FROM sessions WHERE token=?1", [token])
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    let mut headers = HeaderMap::new();
    headers.insert(
        "set-cookie",
        "zenoh_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
            .parse()
            .unwrap(),
    );
    Ok((headers, Json(json!({"ok":true}))))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn setup_password_uses_four_unicode_characters_and_256_byte_limit() {
        for (password, accepted) in [
            ("abc".to_string(), false),
            ("abcd".to_string(), true),
            ("가나다".to_string(), false),
            ("가나다라".to_string(), true),
            ("é".repeat(128), true),
            ("é".repeat(128) + "a", false),
        ] {
            let state = AppState {
                auth: std::sync::Arc::new(Auth::open(":memory:").unwrap()),
                observer: std::sync::Arc::new(crate::observer::Observer::default()),
            };
            let result = setup(
                State(state),
                Json(Credentials {
                    username: "admin".into(),
                    password,
                }),
            )
            .await;
            if accepted {
                assert!(result.is_ok(), "valid password was rejected");
            } else {
                assert_eq!(result.err(), Some(StatusCode::BAD_REQUEST));
            }
        }
    }
    #[test]
    fn attempts_are_rate_limited() {
        let auth = Auth::open(":memory:").unwrap();
        assert!(auth.attempt().is_ok());
        assert_eq!(auth.attempt(), Err(StatusCode::TOO_MANY_REQUESTS));
    }
    #[test]
    fn sessions_require_valid_cookie() {
        let auth = Auth::open(":memory:").unwrap();
        let headers = HeaderMap::new();
        assert_eq!(auth.username(&headers).unwrap(), None);
        let (h, _) = session(&auth, "admin").unwrap();
        let mut request = HeaderMap::new();
        request.insert("cookie", h["set-cookie"].clone());
        assert_eq!(auth.username(&request).unwrap(), Some("admin".into()));
        auth.db
            .lock()
            .unwrap()
            .execute("UPDATE sessions SET expires=0", [])
            .unwrap();
        assert_eq!(auth.username(&request).unwrap(), None);
    }
}
