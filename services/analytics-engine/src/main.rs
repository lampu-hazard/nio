use std::sync::Arc;
use std::env;
use tonic::{transport::Server, Request, Response, Status};
use chrono::{TimeZone, Utc};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

pub mod analytics {
    tonic::include_proto!("analytics.v1");
}

use analytics::analytics_engine_server::{AnalyticsEngine, AnalyticsEngineServer};
use analytics::{
    IngestMessageRequest, IngestMessageResponse, IngestVoiceStateRequest, IngestVoiceStateResponse,
    GetLeaderboardRequest, GetLeaderboardResponse, LeaderboardEntry, ResetLeaderboardRequest, ResetLeaderboardResponse,
};

pub mod aggregator;
pub mod db;

use aggregator::Aggregator;
use db::{DatabaseOp, DbClient};

pub struct AnalyticsEngineService {
    aggregator: Aggregator,
    db_tx: UnboundedSender<DatabaseOp>,
}

#[tonic::async_trait]
impl AnalyticsEngine for AnalyticsEngineService {
    async fn ingest_message(
        &self,
        request: Request<IngestMessageRequest>,
    ) -> Result<Response<IngestMessageResponse>, Status> {
        let req = request.into_inner();

        self.aggregator.record_message(&req.guild_id, &req.author_id);

        let created_at = Utc.timestamp_millis_opt(req.timestamp_ms).single().unwrap_or_else(Utc::now);

        let _ = self.db_tx.send(DatabaseOp::InsertMessage {
            id: req.message_id,
            guild_id: req.guild_id,
            channel_id: req.channel_id,
            author_id: req.author_id,
            content: req.content,
            created_at,
        });

        Ok(Response::new(IngestMessageResponse { success: true }))
    }

    async fn ingest_voice_state(
        &self,
        request: Request<IngestVoiceStateRequest>,
    ) -> Result<Response<IngestVoiceStateResponse>, Status> {
        let req = request.into_inner();
        let time = Utc.timestamp_millis_opt(req.timestamp_ms).single().unwrap_or_else(Utc::now);

        match req.event_type {
            1 => {
                // JOIN
                self.aggregator.record_voice_join(&req.guild_id, &req.user_id, &req.channel_id, time);

                // For join, we generate a UUID for the session and insert it directly
                let session_id = uuid::Uuid::new_v4().to_string();
                let _ = self.db_tx.send(DatabaseOp::InsertVoiceSession {
                    id: session_id,
                    guild_id: req.guild_id,
                    user_id: req.user_id,
                    channel_id: req.channel_id,
                    joined_at: time,
                });
            }
            2 => {
                // LEAVE
                if let Some(dur) = self.aggregator.record_voice_leave(&req.guild_id, &req.user_id, time) {
                    let _ = self.db_tx.send(DatabaseOp::CloseVoiceSession {
                        guild_id: req.guild_id,
                        user_id: req.user_id,
                        left_at: time,
                        duration_secs: dur as i32,
                    });
                }
            }
            3 => {
                // MOVE (Combine Leave + Join)
                if let Some(dur) = self.aggregator.record_voice_leave(&req.guild_id, &req.user_id, time) {
                    let _ = self.db_tx.send(DatabaseOp::CloseVoiceSession {
                        guild_id: req.guild_id.clone(),
                        user_id: req.user_id.clone(),
                        left_at: time,
                        duration_secs: dur as i32,
                    });
                }

                self.aggregator.record_voice_join(&req.guild_id, &req.user_id, &req.channel_id, time);

                let session_id = uuid::Uuid::new_v4().to_string();
                let _ = self.db_tx.send(DatabaseOp::InsertVoiceSession {
                    id: session_id,
                    guild_id: req.guild_id,
                    user_id: req.user_id,
                    channel_id: req.channel_id,
                    joined_at: time,
                });
            }
            _ => return Err(Status::invalid_argument("Invalid event_type")),
        }

        Ok(Response::new(IngestVoiceStateResponse { success: true }))
    }

    async fn get_chat_leaderboard(
        &self,
        request: Request<GetLeaderboardRequest>,
    ) -> Result<Response<GetLeaderboardResponse>, Status> {
        let req = request.into_inner();
        let limit = if req.limit <= 0 { 10 } else { req.limit as usize };

        // For now, we aggregate simply on the DashMap cache
        let entries = self.aggregator.get_leaderboard(false, &req.guild_id, limit);

        let response_entries = entries
            .into_iter()
            .enumerate()
            .map(|(idx, (user_id, score))| LeaderboardEntry {
                rank: (idx + 1) as i32,
                user_id,
                score: score as i64,
            })
            .collect();

        Ok(Response::new(GetLeaderboardResponse { entries: response_entries }))
    }

    async fn get_voice_leaderboard(
        &self,
        request: Request<GetLeaderboardRequest>,
    ) -> Result<Response<GetLeaderboardResponse>, Status> {
        let req = request.into_inner();
        let limit = if req.limit <= 0 { 10 } else { req.limit as usize };

        let entries = self.aggregator.get_leaderboard(true, &req.guild_id, limit);

        let response_entries = entries
            .into_iter()
            .enumerate()
            .map(|(idx, (user_id, score))| LeaderboardEntry {
                rank: (idx + 1) as i32,
                user_id,
                score: score as i64,
            })
            .collect();

        Ok(Response::new(GetLeaderboardResponse { entries: response_entries }))
    }

    async fn reset_leaderboard(
        &self,
        request: Request<ResetLeaderboardRequest>,
    ) -> Result<Response<ResetLeaderboardResponse>, Status> {
        let req = request.into_inner();
        self.aggregator.chat_leaderboard.remove(&req.guild_id);
        self.aggregator.voice_leaderboard.remove(&req.guild_id);
        Ok(Response::new(ResetLeaderboardResponse { success: true }))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    // Check configuration and environment
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
        "postgresql://wign:postgres@localhost:5432/nio".to_string()
    });
    let port = env::var("ANALYTICS_ENGINE_PORT").unwrap_or_else(|_| "50053".to_string());
    let addr = format!("127.0.0.1:{}", port).parse()?;

    println!("Initializing Database Pool...");
    let db_client = Arc::new(DbClient::new(&database_url));

    let aggregator = Aggregator::new();
    println!("Pre-warming in-memory caches from PostgreSQL...");
    if let Err(e) = db_client.hydrate_aggregates(&aggregator).await {
        eprintln!("Warning: Failed to pre-warm cache from PostgreSQL: {}", e);
    } else {
        println!("Pre-warming complete.");
    }

    let (db_tx, db_rx) = unbounded_channel::<DatabaseOp>();

    // Start background flusher thread
    tokio::spawn(db_client.run_flusher_worker(db_rx));

    let service = AnalyticsEngineService {
        aggregator,
        db_tx,
    };

    println!("Analytics Engine server listening on {}", addr);

    Server::builder()
        .add_service(AnalyticsEngineServer::new(service))
        .serve(addr)
        .await?;

    Ok(())
}
