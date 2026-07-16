fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .compile(&["proto/analytics/v1/analytics.proto"], &["proto"])?;
    Ok(())
}
