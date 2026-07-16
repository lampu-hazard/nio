use std::sync::Arc;
use std::time::Duration;
use deadpool_postgres::{Config, ManagerConfig, Pool, RecyclingMethod, Runtime};
use tokio_postgres::NoTls;
use tokio::sync::mpsc::UnboundedReceiver;
use chrono::{DateTime, Utc, Duration as ChronoDuration, NaiveDateTime};
use crate::aggregator::{Aggregator, MessageEvent, VoiceEvent};

pub enum DatabaseOp {
    InsertMessage {
        id: String,
        guild_id: String,
        channel_id: String,
        author_id: String,
        content: String,
        created_at: DateTime<Utc>,
    },
    InsertVoiceSession {
        id: String,
        guild_id: String,
        user_id: String,
        channel_id: String,
        joined_at: DateTime<Utc>,
    },
    CloseVoiceSession {
        guild_id: String,
        user_id: String,
        left_at: DateTime<Utc>,
        duration_secs: i32,
    },
}

pub struct DbClient {
    pool: Pool,
}

impl DbClient {
    pub fn new(database_url: &str) -> Self {
        let mut cfg = Config::new();
        cfg.url = Some(database_url.to_string());
        cfg.manager = Some(ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        });

        let pool = cfg
            .create_pool(Some(Runtime::Tokio1), NoTls)
            .expect("Failed to create deadpool-postgres pool");

        Self { pool }
    }

    pub async fn hydrate_aggregates(&self, aggregator: &Aggregator) -> Result<(), Box<dyn std::error::Error>> {
        let client = self.pool.get().await?;
        let thirty_days_ago = Utc::now() - ChronoDuration::days(30);

        // 1. Hydrate raw chat events for the last 30 days
        let chat_event_rows = client
            .query(
                "SELECT \"guildId\", \"authorId\", \"createdAt\"
                 FROM \"DiscordMessageLog\"
                 WHERE \"deletedAt\" IS NULL AND \"createdAt\" >= $1",
                &[&thirty_days_ago],
            )
            .await?;

        for row in chat_event_rows {
            let guild_id: String = row.get("guildId");
            let author_id: String = row.get("authorId");
            let naive_dt: NaiveDateTime = row.get("createdAt");
            let created_at = DateTime::<Utc>::from_naive_utc_and_offset(naive_dt, Utc);

            let mut events = aggregator.chat_events.entry(guild_id).or_default();
            events.push(MessageEvent {
                author_id,
                created_at,
            });
        }

        // 2. Hydrate all-time chat stats
        let chat_all_rows = client
            .query(
                "SELECT \"guildId\", \"authorId\", COUNT(id)::int8 as count
                 FROM \"DiscordMessageLog\"
                 WHERE \"deletedAt\" IS NULL
                 GROUP BY \"guildId\", \"authorId\"",
                &[],
            )
            .await?;

        for row in chat_all_rows {
            let guild_id: String = row.get("guildId");
            let author_id: String = row.get("authorId");
            let count: i64 = row.get("count");

            let guild_all = aggregator.chat_all_time.entry(guild_id).or_default();
            guild_all.insert(author_id, count as u64);
        }

        // 3. Hydrate raw voice events for the last 30 days
        let voice_event_rows = client
            .query(
                "SELECT \"guildId\", \"userId\", duration, \"joinedAt\"
                 FROM \"VoiceSession\"
                 WHERE \"leftAt\" IS NOT NULL AND \"joinedAt\" >= $1",
                &[&thirty_days_ago],
            )
            .await?;

        for row in voice_event_rows {
            let guild_id: String = row.get("guildId");
            let user_id: String = row.get("userId");
            let duration: i32 = row.get("duration");
            let naive_dt: NaiveDateTime = row.get("joinedAt");
            let joined_at = DateTime::<Utc>::from_naive_utc_and_offset(naive_dt, Utc);

            let mut events = aggregator.voice_events.entry(guild_id).or_default();
            events.push(VoiceEvent {
                user_id,
                duration_secs: duration as u64,
                joined_at,
            });
        }

        // 4. Hydrate all-time voice stats
        let voice_all_rows = client
            .query(
                "SELECT \"guildId\", \"userId\", SUM(duration)::int8 as sum_dur
                 FROM \"VoiceSession\"
                 WHERE \"leftAt\" IS NOT NULL
                 GROUP BY \"guildId\", \"userId\"",
                &[],
            )
            .await?;

        for row in voice_all_rows {
            let guild_id: String = row.get("guildId");
            let user_id: String = row.get("userId");
            let sum_dur: i64 = row.get("sum_dur");

            let guild_all = aggregator.voice_all_time.entry(guild_id).or_default();
            guild_all.insert(user_id, sum_dur as u64);
        }

        Ok(())
    }

    pub async fn run_flusher_worker(self: Arc<Self>, mut rx: UnboundedReceiver<DatabaseOp>) {
        let mut buffer = Vec::new();
        let flush_interval = Duration::from_secs(5);
        let mut interval = tokio::time::interval(flush_interval);
        // Skip the first tick since it fires immediately
        interval.tick().await;

        loop {
            tokio::select! {
                op_opt = rx.recv() => {
                    match op_opt {
                        Some(op) => {
                            buffer.push(op);
                            if buffer.len() >= 100 {
                                if let Err(e) = self.flush(&mut buffer).await {
                                    eprintln!("Error flushing database buffer: {}", e);
                                }
                            }
                        }
                        None => {
                            // Channel closed, flush remaining and exit
                            if !buffer.is_empty() {
                                if let Err(e) = self.flush(&mut buffer).await {
                                    eprintln!("Final flusher error: {}", e);
                                }
                            }
                            break;
                        }
                    }
                }
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        if let Err(e) = self.flush(&mut buffer).await {
                            eprintln!("Periodic flusher error: {}", e);
                        }
                    }
                }
            }
        }
    }

    async fn flush(&self, buffer: &mut Vec<DatabaseOp>) -> Result<(), Box<dyn std::error::Error>> {
        let mut client = self.pool.get().await?;
        let tx = client.transaction().await?;

        let mut messages = Vec::new();

        for op in buffer.drain(..) {
            match op {
                DatabaseOp::InsertMessage { id, guild_id, channel_id, author_id, content, created_at } => {
                    messages.push((id, guild_id, channel_id, author_id, content, created_at));
                }
                DatabaseOp::InsertVoiceSession { id, guild_id, user_id, channel_id, joined_at } => {
                    tx.execute(
                        "INSERT INTO \"VoiceSession\" (id, \"guildId\", \"userId\", \"channelId\", \"joinedAt\")
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT DO NOTHING",
                        &[&id, &guild_id, &user_id, &channel_id, &joined_at.naive_utc()],
                    ).await?;
                }
                DatabaseOp::CloseVoiceSession { guild_id, user_id, left_at, duration_secs } => {
                    // Update the active voice session (closest one with no leftAt timestamp)
                    tx.execute(
                        "UPDATE \"VoiceSession\"
                         SET \"leftAt\" = $1, duration = $2
                         WHERE id = (
                             SELECT id FROM \"VoiceSession\"
                             WHERE \"guildId\" = $3 AND \"userId\" = $4 AND \"leftAt\" IS NULL
                             ORDER BY \"joinedAt\" DESC
                             LIMIT 1
                         )",
                        &[&left_at.naive_utc(), &duration_secs, &guild_id, &user_id],
                    ).await?;
                }
            }
        }

        // Multi-row INSERT message logs optimization
        if !messages.is_empty() {
            for msg in messages {
                tx.execute(
                    "INSERT INTO \"DiscordMessageLog\" (id, \"guildId\", \"channelId\", \"authorId\", content, \"createdAt\")
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (id) DO NOTHING",
                    &[&msg.0, &msg.1, &msg.2, &msg.3, &msg.4, &msg.5.naive_utc()],
                ).await?;
            }
        }

        tx.commit().await?;
        Ok(())
    }
}
