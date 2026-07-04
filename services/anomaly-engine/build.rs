fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .compile(&["proto/anomaly/v1/anomaly.proto"], &["proto"])?;
    Ok(())
}
