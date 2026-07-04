use crate::proto::anomaly_engine_server::{AnomalyEngine, AnomalyEngineServer};
use crate::proto::{AnalyzeMessageRequest, AnalyzeMessageResponse};
use crate::state::EngineState;
use crate::detectors;
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

impl Default for MyAnomalyEngine {
    fn default() -> Self {
        Self::new()
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

pub async fn run_server(addr: std::net::SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
    let engine = MyAnomalyEngine::new();
    Server::builder()
        .add_service(AnomalyEngineServer::new(engine))
        .serve(addr)
        .await?;
    Ok(())
}
