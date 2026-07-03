use std::net::SocketAddr;
use std::sync::Arc;
use dashmap::DashMap;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use nio_slowmode_engine::http;
use nio_slowmode_engine::state;

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state: state::AppState = Arc::new(DashMap::new());

    let state_clone = Arc::clone(&state);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await; // hourly
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;
            state_clone.retain(|_, traffic| {
                // Keep if there is activity in the last 1 hour
                traffic.history.iter().any(|r| r.timestamp_ms > now.saturating_sub(3600000))
            });
        }
    });

    let app = http::create_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3003));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    println!("nio-slowmode-engine listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}
