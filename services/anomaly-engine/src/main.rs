use nio_anomaly_engine::server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:50051".parse()?;
    println!("gRPC Anomaly Engine listening on {}", addr);
    server::run_server(addr).await?;
    Ok(())
}
