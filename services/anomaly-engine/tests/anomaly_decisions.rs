use nio_anomaly_engine::proto::anomaly_engine_client::AnomalyEngineClient;
use nio_anomaly_engine::proto::{AnalyzeMessageRequest, GuildAnomalyConfig, Decision, Severity, FindingKind};
use nio_anomaly_engine::server;
use std::net::SocketAddr;

#[tokio::test]
async fn test_detection_scenarios() {
    let addr: SocketAddr = "127.0.0.1:50052".parse().unwrap();

    // Spawn server in the background
    tokio::spawn(async move {
        let _ = server::run_server(addr).await;
    });

    // Give the server a small moment to start up
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Scaffold client
    let mut client = AnomalyEngineClient::connect("http://127.0.0.1:50052")
        .await
        .expect("gRPC server should be running locally");

    let config = Some(GuildAnomalyConfig {
        phishing_enabled: true,
        content_anomaly_enabled: true,
        user_anomaly_enabled: true,
        guild_baseline_enabled: true,
        enforcement_mode: 1, // AUDIT_ONLY
    });

    // Case 1: Safe message
    let response = client
        .analyze_message(AnalyzeMessageRequest {
            guild_id: "g1".to_string(),
            channel_id: "c1".to_string(),
            user_id: "u1".to_string(),
            message_id: "m1".to_string(),
            content: "Hello everyone, check out our website!".to_string(),
            urls: vec!["https://example.com".to_string()],
            timestamp_ms: 10000,
            config: config.clone(),
        })
        .await
        .unwrap()
        .into_inner();

    assert_eq!(response.decision, Decision::Allow as i32);

    // Case 2: Phishing message
    let response2 = client
        .analyze_message(AnalyzeMessageRequest {
            guild_id: "g1".to_string(),
            channel_id: "c1".to_string(),
            user_id: "u2".to_string(),
            message_id: "m2".to_string(),
            content: "Claim free discord nitro here fast!".to_string(),
            urls: vec!["https://claim-free-discord-nitro.ru".to_string()],
            timestamp_ms: 10500,
            config: config.clone(),
        })
        .await
        .unwrap()
        .into_inner();

    assert_eq!(response2.decision, Decision::DeleteMessage as i32);
    assert_eq!(response2.severity, Severity::Critical as i32);
    assert!(response2.findings.iter().any(|f| f.kind == FindingKind::PhishingLink as i32));
}
