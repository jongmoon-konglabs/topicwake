use crate::AppState;
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::Read;
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::{SystemTime, UNIX_EPOCH},
};
const MAX_TOPICS: usize = 2000;
const MAX_PREVIEW: usize = 8192;
#[derive(Clone, Serialize)]
pub struct Topic {
    key: String,
    kind: &'static str,
    message_count: u64,
    bytes: u64,
    last_seen: u64,
    payload: String,
    encoding: String,
    source_id: Option<String>,
    source_ip: Option<String>,
    preview_truncated: bool,
    last_payload_bytes: usize,
}
#[derive(Default)]
pub struct Observer {
    topics: RwLock<HashMap<String, Topic>>,
    session: RwLock<Option<zenoh::Session>>,
    error: RwLock<Option<String>>,
    truncated: RwLock<bool>,
}
impl Observer {
    pub async fn shutdown(&self) {
        let session = self.session.write().unwrap().take();
        if let Some(session) = session {
            let _ = session.close().await;
        }
    }

    pub async fn run(self: Arc<Self>) {
        let mut config = zenoh::Config::default();
        if let Ok(path) = std::env::var("ZENOH_ADMIN_CONFIG") {
            match zenoh::Config::from_file(path) {
                Ok(c) => config = c,
                Err(e) => {
                    *self.error.write().unwrap() = Some(e.to_string());
                    return;
                }
            }
        }
        self.observe(config).await;
    }
    async fn observe(self: Arc<Self>, config: zenoh::Config) {
        let session = match zenoh::open(config).await {
            Ok(s) => s,
            Err(e) => {
                *self.error.write().unwrap() = Some(e.to_string());
                return;
            }
        };
        let subscriber = match session.declare_subscriber("**").await {
            Ok(s) => s,
            Err(e) => {
                *self.error.write().unwrap() = Some(e.to_string());
                return;
            }
        };
        *self.session.write().unwrap() = Some(session);
        while let Ok(sample) = subscriber.recv_async().await {
            let total_bytes = sample.payload().len();
            let mut preview = Vec::with_capacity(total_bytes.min(MAX_PREVIEW));
            if sample
                .payload()
                .reader()
                .take(MAX_PREVIEW as u64)
                .read_to_end(&mut preview)
                .is_ok()
            {
                self.ingest(
                    sample.key_expr().as_str(),
                    &preview,
                    total_bytes,
                    &sample.encoding().to_string(),
                    sample.kind(),
                );
            }
        }
        *self.error.write().unwrap() =
            Some("Subscription closed; restart observer to reconnect".into());
        *self.session.write().unwrap() = None;
    }
    #[cfg(test)]
    fn record(&self, key: &str, data: &[u8], encoding: &str) {
        self.ingest(
            key,
            data,
            data.len(),
            encoding,
            zenoh::sample::SampleKind::Put,
        );
    }
    fn ingest(
        &self,
        key: &str,
        data: &[u8],
        total_bytes: usize,
        encoding: &str,
        kind: zenoh::sample::SampleKind,
    ) {
        let mut topics = self.topics.write().unwrap();
        if !topics.contains_key(key) && topics.len() >= MAX_TOPICS {
            *self.truncated.write().unwrap() = true;
            return;
        }
        let preview = &data[..data.len().min(MAX_PREVIEW)];
        let payload = match std::str::from_utf8(preview) {
            Ok(t) => t.to_owned(),
            Err(e) if e.error_len().is_none() && total_bytes > MAX_PREVIEW => {
                String::from_utf8_lossy(&preview[..e.valid_up_to()]).into_owned()
            }
            Err(_) => format!("[binary hex] {}", hex::encode(preview)),
        };
        let topic = topics.entry(key.into()).or_insert_with(|| Topic {
            key: key.into(),
            kind: "put",
            message_count: 0,
            bytes: 0,
            last_seen: 0,
            payload: String::new(),
            encoding: String::new(),
            source_id: None,
            source_ip: None,
            preview_truncated: false,
            last_payload_bytes: 0,
        });
        topic.kind = match kind {
            zenoh::sample::SampleKind::Put => "put",
            zenoh::sample::SampleKind::Delete => "delete",
        };
        topic.message_count = topic.message_count.saturating_add(1);
        topic.bytes = topic.bytes.saturating_add(total_bytes as u64);
        topic.last_seen = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        topic.preview_truncated = total_bytes > MAX_PREVIEW;
        topic.last_payload_bytes = total_bytes;
        topic.payload = payload;
        topic.encoding = encoding.into();
    }
}
#[derive(Default, Deserialize)]
pub struct Filters {
    search: Option<String>,
    sort: Option<String>,
    order: Option<String>,
}
pub async fn topics(
    State(s): State<AppState>,
    h: HeaderMap,
    Query(f): Query<Filters>,
) -> Result<Json<Value>, StatusCode> {
    s.auth.username(&h)?.ok_or(StatusCode::UNAUTHORIZED)?;
    let search = f.search.unwrap_or_default().to_lowercase();
    let mut topics: Vec<_> = s
        .observer
        .topics
        .read()
        .unwrap()
        .values()
        .filter(|t| {
            t.key.to_lowercase().contains(&search) || t.payload.to_lowercase().contains(&search)
        })
        .cloned()
        .collect();
    topics.sort_by(|a, b| match f.sort.as_deref() {
        Some("last_seen") => a.last_seen.cmp(&b.last_seen),
        Some("message_count") => a.message_count.cmp(&b.message_count),
        _ => a.key.cmp(&b.key),
    });
    if f.order.as_deref() == Some("desc") {
        topics.reverse();
    }
    Ok(Json(
        json!({"topics":topics,"truncated":*s.observer.truncated.read().unwrap(),"max_topics":MAX_TOPICS,"preview_bytes":MAX_PREVIEW}),
    ))
}
pub async fn status(State(s): State<AppState>, h: HeaderMap) -> Result<Json<Value>, StatusCode> {
    s.auth.username(&h)?.ok_or(StatusCode::UNAUTHORIZED)?;
    let session = s.observer.session.read().unwrap().clone();
    let (id, peers, routers) = if let Some(session) = session {
        (
            Some(session.zid().to_string()),
            session
                .info()
                .peers_zid()
                .await
                .map(|z| z.to_string())
                .collect::<Vec<_>>(),
            session
                .info()
                .routers_zid()
                .await
                .map(|z| z.to_string())
                .collect::<Vec<_>>(),
        )
    } else {
        (None, vec![], vec![])
    };
    let interfaces_result = if_addrs::get_if_addrs();
    let interface_error = interfaces_result.as_ref().err().map(|e| e.to_string());
    let interfaces = interfaces_result
        .unwrap_or_default()
        .into_iter()
        .map(|i| json!({"name":i.name,"ip":i.addr.ip().to_string()}))
        .collect::<Vec<_>>();
    Ok(Json(
        json!({"zenoh_connected":id.is_some(),"session_id":id,"peers":peers,"routers":routers,"interface_error":interface_error,"interfaces":interfaces,"ssid":crate::network::ssid().await,"internet":"not_checked","status":s.observer.error.read().unwrap().clone().unwrap_or_else(||"Observing reachable live publications; source IP unavailable".into())}),
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn isolated_loopback_publication_reaches_observer() {
        fn isolated_config() -> zenoh::Config {
            let mut config = zenoh::Config::default();
            config.insert_json5("mode", "\"peer\"").unwrap();
            config
                .insert_json5("scouting/multicast/enabled", "false")
                .unwrap();
            config
                .insert_json5("scouting/gossip/enabled", "false")
                .unwrap();
            config.insert_json5("listen/endpoints", "[]").unwrap();
            config
        }
        // Reserve a loopback-only port; never enable multicast, gossip, or non-loopback listeners.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let endpoint = format!("[\"tcp/127.0.0.1:{port}\"]");
        let mut publisher_config = isolated_config();
        publisher_config
            .insert_json5("listen/endpoints", &endpoint)
            .unwrap();
        let publisher = zenoh::open(publisher_config).await.unwrap();
        let mut observer_config = isolated_config();
        observer_config
            .insert_json5("connect/endpoints", &endpoint)
            .unwrap();
        let observer = Arc::new(Observer::default());
        let task = tokio::spawn(observer.clone().observe(observer_config));
        let received = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                publisher
                    .put("isolated/synthetic", "loopback-only")
                    .await
                    .unwrap();
                if observer
                    .topics
                    .read()
                    .unwrap()
                    .contains_key("isolated/synthetic")
                {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await;
        received.expect("loopback synthetic sample was not observed");
        {
            let topics = observer.topics.read().unwrap();
            assert_eq!(topics["isolated/synthetic"].kind, "put");
            assert_eq!(topics["isolated/synthetic"].payload, "loopback-only");
        }
        let deleted = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                publisher.delete("isolated/synthetic").await.unwrap();
                if observer.topics.read().unwrap()["isolated/synthetic"].kind == "delete" {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await;
        task.abort();
        let _ = task.await;
        let session = observer.session.write().unwrap().take();
        if let Some(session) = session {
            session.close().await.unwrap();
        }
        publisher.close().await.unwrap();
        deleted.expect("loopback delete sample was not observed");
        let topics = observer.topics.read().unwrap();
        let sample = &topics["isolated/synthetic"];
        assert!(sample.message_count >= 2);
        assert_eq!(sample.kind, "delete");
        assert_eq!(sample.payload, "");
        assert_eq!(sample.last_payload_bytes, 0);
    }
    #[test]
    fn put_snapshot_reports_kind() {
        let observer = Observer::default();
        observer.record("test/key", b"", "text/plain");
        let topics = observer.topics.read().unwrap();
        assert_eq!(
            serde_json::to_value(&topics["test/key"]).unwrap()["kind"],
            "put"
        );
    }
    #[test]
    fn delete_snapshot_differs_from_empty_put() {
        let observer = Observer::default();
        observer.record("test/key", b"", "text/plain");
        assert_eq!(observer.topics.read().unwrap()["test/key"].kind, "put");
        observer.ingest(
            "test/key",
            b"",
            0,
            "text/plain",
            zenoh::sample::SampleKind::Delete,
        );
        let topics = observer.topics.read().unwrap();
        let topic = &topics["test/key"];
        assert_eq!(serde_json::to_value(topic).unwrap()["kind"], "delete");
        assert_eq!(topic.payload, "");
        assert_eq!(topic.message_count, 2);
        assert_eq!(topic.bytes, 0);
    }
    #[test]
    fn bounded_previews_and_counters() {
        let o = Observer::default();
        o.record("test/key", &vec![b'a'; 10000], "text/plain");
        o.record("test/key", b"ok", "text/plain");
        let t = o.topics.read().unwrap();
        assert_eq!(t["test/key"].message_count, 2);
        assert_eq!(t["test/key"].bytes, 10002);
        assert_eq!(t["test/key"].payload, "ok");
        assert!(t["test/key"].source_ip.is_none());
    }
    #[test]
    fn incomplete_binary_is_not_text() {
        let o = Observer::default();
        o.record("test/key", &[0xe2], "application/octet-stream");
        assert_eq!(
            o.topics.read().unwrap()["test/key"].payload,
            "[binary hex] e2"
        );
    }
    #[test]
    fn utf8_preview_truncation_is_explicit() {
        let o = Observer::default();
        let payload = "가".repeat(3000);
        o.record("test/key", payload.as_bytes(), "text/plain");
        let topics = o.topics.read().unwrap();
        let topic = &topics["test/key"];
        assert!(topic.preview_truncated);
        assert_eq!(topic.last_payload_bytes, 9000);
        assert!(!topic.payload.starts_with("[binary"));
    }
    #[test]
    fn topic_limit_and_binary() {
        let o = Observer::default();
        for i in 0..=MAX_TOPICS {
            o.record(&format!("test/{i}"), &[255], "application/octet-stream");
        }
        assert_eq!(o.topics.read().unwrap().len(), MAX_TOPICS);
        assert!(*o.truncated.read().unwrap());
        assert!(o.topics.read().unwrap()["test/0"].payload.contains("ff"));
    }
}
