pub mod proto {
    tonic::include_proto!("anomaly.v1");
}

use tonic::{transport::Server, Request, Response, Status};
use proto::anomaly_engine_server::{AnomalyEngine, AnomalyEngineServer};
use proto::{AnalyzeMessageRequest, AnalyzeMessageResponse, Decision, Severity};

#[derive(Debug, Default)]
pub struct MyAnomalyEngine {}

#[tonic::async_trait]
impl AnomalyEngine for MyAnomalyEngine {
    async fn analyze_message(
        &self,
        request: Request<AnalyzeMessageRequest>,
    ) -> Result<Response<AnalyzeMessageResponse>, Status> {
        let req = request.into_inner();
        let reply = AnalyzeMessageResponse {
            decision: Decision::Allow as i32,
            severity: Severity::Unspecified as i32,
            confidence: 0.0,
            reason: format!("Stub response for user {}", req.user_id),
            findings: vec![],
            metrics: std::collections::HashMap::new(),
        };
        Ok(Response::new(reply))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "[::1]:50051".parse()?;
    let engine = MyAnomalyEngine::default();

    println!("gRPC Anomaly Engine listening on {}", addr);

    Server::builder()
        .add_service(AnomalyEngineServer::new(engine))
        .serve(addr)
        .await?;

    Ok(())
}
