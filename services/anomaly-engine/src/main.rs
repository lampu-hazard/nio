use nio_anomaly_engine::proto::anomaly_engine_server::{AnomalyEngine, AnomalyEngineServer};
use nio_anomaly_engine::proto::{AnalyzeMessageRequest, AnalyzeMessageResponse};
use nio_anomaly_engine::state::EngineState;
use nio_anomaly_engine::detectors;
use tonic::{transport::Server, Request, Response, Status};
use std::sync::Arc;
use dashmap::DashMap;

#[derive(Debug)]
pub struct MyAnomalyEngine {
    state: EngineState,
}

impl MyAnomalyEngine {
    pub fn new() -> Self {
        Self {
            state: Arc::new(DashMap::new()),
        }
    }
}

#[tonic::async_trait]
impl AnomalyEngine for MyAnomalyEngine {
    async fn analyze_message(
        &self,
        request: Request<AnalyzeMessageRequest>,
    ) -> Result<Response<AnalyzeMessageResponse>, Status> {
        let req = request.into_inner();
        let reply = detectors::analyze(&req, &self.state);
        Ok(Response::new(reply))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "127.0.0.1:50051".parse()?;
    let engine = MyAnomalyEngine::new();

    println!("gRPC Anomaly Engine listening on {}", addr);

    Server::builder()
        .add_service(AnomalyEngineServer::new(engine))
        .serve(addr)
        .await?;

    Ok(())
}
