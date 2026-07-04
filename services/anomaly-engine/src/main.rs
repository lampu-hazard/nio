use nio_anomaly_engine::server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "127.0.0.1:50051".parse()?;
    println!("gRPC Anomaly Engine listening on {}", addr);
    server::run_server(addr).await?;
    Ok(())
}
