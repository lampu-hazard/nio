use axum_test::TestServer;
use nio_slowmode_engine::{http, state};
use std::sync::Arc;
use dashmap::DashMap;
use serde_json::json;

#[tokio::test]
async fn test_slowmode_scenarios() {
    let state: state::AppState = Arc::new(DashMap::new());
    let app = http::create_router(state);
    let server = TestServer::new(app).unwrap();

    let config = json!({
        "quietSeconds": 0,
        "normalSeconds": 5,
        "busySeconds": 10
    });

    // 1. First message on quiet channel (current slowmode is 0) -> remains quiet
    let response = server
        .post("/v1/slowmode/analyze")
        .json(&json!({
            "guildId": "g1",
            "channelId": "c1",
            "userId": "user_0",
            "timestampMs": 10000,
            "currentSlowmodeSeconds": 0,
            "config": config
        }))
        .await;

    response.assert_status_ok();
    let body = response.json::<serde_json::Value>();
    assert_eq!(body["level"], "QUIET");
    assert_eq!(body["recommendedSeconds"], 0);
    assert_eq!(body["shouldApply"], false);

    // 2. Second message -> remains quiet
    let response = server
        .post("/v1/slowmode/analyze")
        .json(&json!({
            "guildId": "g1",
            "channelId": "c1",
            "userId": "user_1",
            "timestampMs": 11000,
            "currentSlowmodeSeconds": 0,
            "config": config
        }))
        .await;

    response.assert_status_ok();
    let body = response.json::<serde_json::Value>();
    assert_eq!(body["level"], "QUIET");
    assert_eq!(body["recommendedSeconds"], 0);
    assert_eq!(body["shouldApply"], false);

    // 3. Third message within 10s (12000 ms) -> transitions to NORMAL
    let response = server
        .post("/v1/slowmode/analyze")
        .json(&json!({
            "guildId": "g1",
            "channelId": "c1",
            "userId": "user_2",
            "timestampMs": 12000,
            "currentSlowmodeSeconds": 0,
            "config": config
        }))
        .await;

    response.assert_status_ok();
    let body = response.json::<serde_json::Value>();
    assert_eq!(body["level"], "NORMAL");
    assert_eq!(body["recommendedSeconds"], 5);
    assert_eq!(body["shouldApply"], true);

    // 4. Send a total of 8 messages within 10 seconds of the start -> transitions to BUSY
    // Since we've already sent 3 messages (at 10000, 11000, 12000), let's send 5 more.
    // Let's send them close to 12000, say, 12100, 12200, 12300, 12400, 12500.
    // The current slowmode was updated to 5, so we pass currentSlowmodeSeconds: 5.
    for i in 3..8 {
        let r = server
            .post("/v1/slowmode/analyze")
            .json(&json!({
                "guildId": "g1",
                "channelId": "c1",
                "userId": format!("user_{}", i),
                "timestampMs": 12000 + (i - 2) * 100, // 12100, 12200, etc.
                "currentSlowmodeSeconds": 5,
                "config": config
            }))
            .await;

        r.assert_status_ok();
        if i == 7 {
            let body = r.json::<serde_json::Value>();
            assert_eq!(body["level"], "BUSY");
            assert_eq!(body["recommendedSeconds"], 10);
            assert_eq!(body["shouldApply"], true);
        }
    }
}
