mod auth;
mod network;
mod observer;
use axum::{
    Router,
    extract::Request,
    http::StatusCode,
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use std::{net::SocketAddr, sync::Arc};

#[derive(Clone)]
struct AppState {
    auth: Arc<auth::Auth>,
    observer: Arc<observer::Observer>,
}

async fn same_origin(
    axum::extract::State(allowed_hosts): axum::extract::State<Vec<String>>,
    req: Request,
    next: middleware::Next,
) -> Response {
    let host = req
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let allowed = allowed_hosts.iter().any(|allowed| allowed == host);
    let origin_ok = req
        .headers()
        .get("origin")
        .map(|v| v.to_str().is_ok_and(|o| o == format!("http://{host}")))
        .unwrap_or(true);
    if !allowed || !origin_ok {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    headers.insert("x-content-type-options", "nosniff".parse().unwrap());
    headers.insert("content-security-policy", "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'".parse().unwrap());
    headers.insert("cache-control", "no-store".parse().unwrap());
    response
}
pub struct RunningServer {
    pub address: SocketAddr,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    server: tokio::task::JoinHandle<std::io::Result<()>>,
    observer_task: tokio::task::JoinHandle<()>,
    observer: Arc<observer::Observer>,
    _listener_guard: std::net::TcpListener,
}

impl RunningServer {
    pub fn is_finished(&self) -> bool {
        self.server.is_finished()
    }
    pub async fn shutdown(mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        self.observer_task.abort();
        let _ = (&mut self.observer_task).await;
        let _ =
            tokio::time::timeout(std::time::Duration::from_secs(3), self.observer.shutdown()).await;
        let mut server = self.server;
        if tokio::time::timeout(std::time::Duration::from_secs(3), &mut server)
            .await
            .is_err()
        {
            server.abort();
            let _ = server.await;
        }
    }
}

pub async fn start_server(
    listener: tokio::net::TcpListener,
    database: &std::path::Path,
    frontend: &std::path::Path,
) -> Result<RunningServer, Box<dyn std::error::Error + Send + Sync>> {
    let listener = listener.into_std()?;
    // Keep this port reserved even if serving fails, until the webview is gone.
    let listener_guard = listener.try_clone()?;
    let listener = tokio::net::TcpListener::from_std(listener)?;
    let address = listener.local_addr()?;
    if !address.ip().is_loopback() {
        return Err("server must use a loopback listener".into());
    }
    if !frontend.join("index.html").is_file() {
        return Err("frontend assets are missing".into());
    }
    let database = database.to_str().ok_or("invalid database path")?;
    let auth = Arc::new(auth::Auth::open(database)?);
    let observer = Arc::new(observer::Observer::default());
    let state = AppState {
        auth,
        observer: observer.clone(),
    };
    let allowed_hosts = vec![
        format!("127.0.0.1:{}", address.port()),
        format!("localhost:{}", address.port()),
    ];
    let app = Router::new()
        .route("/api/auth/status", get(auth::status))
        .route("/api/auth/setup", post(auth::setup))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/me", get(auth::me))
        .route("/api/status", get(observer::status))
        .route("/api/topics", get(observer::topics))
        .route("/api/network/check", post(network::internet))
        .fallback_service(tower_http::services::ServeDir::new(frontend))
        .with_state(state)
        .layer(middleware::from_fn_with_state(allowed_hosts, same_origin));
    let observer_task = tokio::spawn(observer.clone().run());
    let (shutdown, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = stopped.await;
            })
            .await
    });
    Ok(RunningServer {
        address,
        shutdown: Some(shutdown),
        server,
        observer_task,
        observer,
        _listener_guard: listener_guard,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;
    fn app() -> Router {
        Router::new()
            .route("/api/auth/setup", post(auth::setup))
            .route("/api/auth/me", get(auth::me))
            .route("/api/auth/logout", post(auth::logout))
            .route("/api/topics", get(observer::topics))
            .route("/api/status", get(observer::status))
            .with_state(AppState {
                auth: Arc::new(auth::Auth::open(":memory:").unwrap()),
                observer: Arc::new(observer::Observer::default()),
            })
            .layer(middleware::from_fn_with_state(
                vec!["localhost:8080".to_string()],
                same_origin,
            ))
    }
    #[tokio::test]
    async fn failed_server_reserves_port_until_owned_shutdown() {
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let guard = listener.into_std().unwrap();
        let (shutdown, _stopped) = tokio::sync::oneshot::channel();
        let observer_task = tokio::spawn(std::future::pending::<()>());
        let aborted = observer_task.abort_handle();
        let server = tokio::spawn(async { Ok(()) });
        let running = RunningServer {
            address,
            shutdown: Some(shutdown),
            server,
            observer_task,
            observer: Arc::new(observer::Observer::default()),
            _listener_guard: guard,
        };
        tokio::task::yield_now().await;
        assert!(running.is_finished());
        assert!(tokio::net::TcpListener::bind(address).await.is_err());
        running.shutdown().await;
        assert!(aborted.is_finished());
        assert!(tokio::net::TcpListener::bind(address).await.is_ok());
    }
    #[tokio::test]
    async fn missing_assets_fail_before_database_creation_or_collection() {
        let directory = std::env::temp_dir().join(format!("zenoh-start-{}", rand::random::<u64>()));
        std::fs::create_dir(&directory).unwrap();
        let database = directory.join("account.sqlite3");
        let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        assert!(start_server(listener, &database, &directory).await.is_err());
        assert!(!database.exists());
        std::fs::remove_dir(directory).unwrap();
    }

    #[tokio::test]
    async fn rejects_untrusted_origin_host_and_anonymous_reads() {
        for (host, origin, path, expected) in [
            ("evil.test:8080", None, "/api/topics", 403),
            ("localhost:8081", None, "/api/topics", 403),
            (
                "localhost:8080",
                Some("https://evil.test"),
                "/api/topics",
                403,
            ),
            ("localhost:8080", None, "/api/topics", 401),
            ("localhost:8080", None, "/api/status", 401),
        ] {
            let mut request = Request::builder().uri(path).header("host", host);
            if let Some(origin) = origin {
                request = request.header("origin", origin);
            }
            let response = app()
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status().as_u16(), expected);
        }
    }
    #[tokio::test]
    async fn setup_authenticate_and_logout() {
        let app = app();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/setup")
                    .header("host", "localhost:8080")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"username":"admin","password":"test-password-long"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let cookie = response.headers()["set-cookie"].clone();
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/auth/me")
                    .header("host", "localhost:8080")
                    .header("cookie", cookie.clone())
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/auth/logout")
                    .header("host", "localhost:8080")
                    .header("cookie", cookie.clone())
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/auth/me")
                    .header("host", "localhost:8080")
                    .header("cookie", cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
