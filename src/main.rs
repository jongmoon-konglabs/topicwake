#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let database = std::env::var("ZENOH_ADMIN_DB").unwrap_or_else(|_| "zenoh-admin.sqlite3".into());
    let port: u16 = std::env::var("ZENOH_ADMIN_PORT")
        .unwrap_or_else(|_| "8080".into())
        .parse()?;
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    let server = zenoh_admin::start_server(
        listener,
        std::path::Path::new(&database),
        std::path::Path::new("frontend/dist"),
    )
    .await?;
    println!(
        "Topicwake: http://localhost:{} (read-only observer)",
        server.address.port()
    );
    tokio::signal::ctrl_c().await?;
    server.shutdown().await;
    Ok(())
}
