use crate::AppState;
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use serde_json::{Value, json};
use std::time::{Duration, Instant};

const SSID_CACHE_TTL: Duration = Duration::from_secs(30);
static SSID_CACHE: tokio::sync::Mutex<Option<SsidSnapshot>> = tokio::sync::Mutex::const_new(None);

struct SsidSnapshot {
    checked_at: Instant,
    value: Option<String>,
}

impl SsidSnapshot {
    fn fresh_value(&self, now: Instant) -> Option<Option<String>> {
        (now.duration_since(self.checked_at) < SSID_CACHE_TTL).then(|| self.value.clone())
    }
}

pub async fn internet(State(s): State<AppState>, h: HeaderMap) -> Result<Json<Value>, StatusCode> {
    s.auth.username(&h)?.ok_or(StatusCode::UNAUTHORIZED)?;
    let result = tokio::time::timeout(
        Duration::from_secs(3),
        tokio::net::TcpStream::connect(("example.com", 443)),
    )
    .await;
    Ok(Json(
        json!({"internet":if matches!(result,Ok(Ok(_))){"reachable"}else{"unreachable"},"target":"example.com:443","meaning":"DNS lookup and TCP connect only; not general internet health"}),
    ))
}
pub async fn ssid() -> Option<String> {
    // Serialize refreshes and cache unknown results too, avoiding subprocess storms on OS privacy failures.
    let mut cache = SSID_CACHE.lock().await;
    if let Some(value) = cache
        .as_ref()
        .and_then(|entry| entry.fresh_value(Instant::now()))
    {
        return value;
    }
    let value = read_ssid().await;
    *cache = Some(SsidSnapshot {
        checked_at: Instant::now(),
        value: value.clone(),
    });
    value
}

async fn read_ssid() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = tokio::time::timeout(
            Duration::from_secs(2),
            tokio::process::Command::new("/usr/sbin/networksetup")
                .args(["-getairportnetwork", "en0"])
                .kill_on_drop(true)
                .output(),
        )
        .await
        .ok()?
        .ok()?;
        let text = String::from_utf8(output.stdout).ok()?;
        text.trim()
            .strip_prefix("Current Wi-Fi Network: ")
            .filter(|s| !s.is_empty())
            .map(String::from)
    }
    #[cfg(not(target_os = "macos"))]
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssid_cache_preserves_known_and_unknown_values_until_expiry() {
        let now = Instant::now();
        for value in [Some("lab-network".to_string()), None] {
            let snapshot = SsidSnapshot {
                checked_at: now,
                value: value.clone(),
            };
            assert_eq!(snapshot.fresh_value(now), Some(value.clone()));
            assert_eq!(
                snapshot.fresh_value(now + Duration::from_secs(29)),
                Some(value)
            );
            assert_eq!(snapshot.fresh_value(now + SSID_CACHE_TTL), None);
        }
    }
}
