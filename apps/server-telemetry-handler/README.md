# SOS-Hook Telemetry Handler

Asynchronous telemetry logging service with Zero-Knowledge Proof generation for the ALYGN Sovereign Compliance Infrastructure.

## Features

- **Async Event Logging**: Thread-safe queue with batch processing
- **Connection Pooling**: Efficient PostgreSQL connections via libpqxx
- **Zero-Knowledge Proofs**: Generates ZKPs proving model compliance without revealing weights
- **Cryptographic Attestation**: HMAC-SHA256 signatures for event integrity
- **Performance Metrics**: Real-time throughput monitoring

## Dependencies

- C++17 compiler (GCC 9+ or Clang 10+)
- CMake 3.16+
- libpqxx (PostgreSQL C++ client)
- OpenSSL (cryptographic functions)
- libsodium (secure random generation)

## Build

### Local Build

#### Ubuntu / Debian

```bash
# Install dependencies
sudo apt-get install -y \
    build-essential cmake pkg-config \
    libpqxx-dev libpq-dev libssl-dev libsodium-dev

# Build
mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)

# Run
./sos_telemetry_handler
```

#### macOS (Homebrew)

```bash
# Install dependencies
brew install cmake pkgconf libpqxx libpq openssl@3 libsodium

# Set environment paths for keg-only libraries (essential for macOS)
export PKG_CONFIG_PATH="/usr/local/opt/openssl@3/lib/pkgconfig:/usr/local/opt/libpq/lib/pkgconfig"
export LDFLAGS="-L/usr/local/opt/openssl@3/lib -L/usr/local/opt/libpq/lib"
export CPPFLAGS="-I/usr/local/opt/openssl@3/include -I/usr/local/opt/libpq/include"

# Build
mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(sysctl -n hw.ncpu)

# Run
./sos_telemetry_handler
```

### Docker Build

```bash
# Build image
docker build -t align-telemetry-handler .

# Run with environment file
docker run --env-file .env align-telemetry-handler

# Or use Docker Compose
docker compose up -d
```

## Configuration

| Environment Variable         | Default        | Description                  |
| ---------------------------- | -------------- | ---------------------------- |
| `SUPABASE_CONNECTION_STRING` | -              | PostgreSQL connection string |
| `DPU_ID`                     | `dpu-node-001` | DPU identifier               |
| `BATCH_SIZE`                 | `50`           | Events per batch             |
| `FLUSH_INTERVAL_MS`          | `3000`         | Batch flush interval         |
| `ENABLE_ZKP`                 | `true`         | Enable ZKP generation        |
| `ENABLE_METRICS`             | `true`         | Enable performance metrics   |

## Deployment

### Google Cloud Run

```bash
# Build and push to Artifact Registry
gcloud builds submit --tag gcr.io/PROJECT_ID/align-telemetry-handler

# Deploy to Cloud Run
gcloud run deploy align-telemetry-handler \
    --image gcr.io/PROJECT_ID/align-telemetry-handler \
    --platform managed \
    --region us-central1 \
    --set-env-vars "SUPABASE_CONNECTION_STRING=..."
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telemetry-handler
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: telemetry-handler
        image: align-telemetry-handler:latest
        envFrom:
        - secretRef:
            name: telemetry-secrets
```

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                   SOS-Hook Handler                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │ Event Queue │ → │ ZKP System  │ → │ DB Pool     │   │
│  │ (async)     │   │ (libsodium) │   │ (libpqxx)   │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   │
│         ↓                 ↓                 ↓          │
│  ┌─────────────────────────────────────────────────┐   │
│  │             Worker Thread (batch flush)          │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                             │
│              Supabase (compliance_audit_log)           │
└─────────────────────────────────────────────────────────┘
```
