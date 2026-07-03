use axum::{extract::State, routing::{get, post}, Json, Router};
use serde_json::{json, Value};
use crate::types::{AnalyzeRequest, AnalyzeResponse};
use crate::state::AppState;
use crate::engine::analyze_channel;

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/v1/slowmode/analyze", post(analyze_handler))
        .with_state(state)
}

async fn health_handler() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

async fn analyze_handler(
    State(state): State<AppState>,
    Json(payload): Json<AnalyzeRequest>,
) -> Json<AnalyzeResponse> {
    let key = format!("{}:{}", payload.guild_id, payload.channel_id);

    let mut channel_traffic = state.entry(key).or_default();
    let response = analyze_channel(&payload, channel_traffic.value_mut());

    Json(response)
}
