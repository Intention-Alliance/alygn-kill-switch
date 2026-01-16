# ============================================
# SOS-Hook Telemetry Handler - Multi-Stage Build
# ============================================
# Build: docker build -t align-telemetry-handler .
# Run:   docker run --env-file .env align-telemetry-handler
# ============================================

# Stage 1: Builder
FROM ubuntu:22.04 AS builder

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    git \
    libpqxx-dev \
    libpq-dev \
    libssl-dev \
    libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

# Create build directory
WORKDIR /build

# Copy source files
COPY CMakeLists.txt .
COPY src/ src/
COPY include/ include/

# Build the application
RUN mkdir -p build && cd build \
    && cmake -DCMAKE_BUILD_TYPE=Release .. \
    && make -j$(nproc)

# Stage 2: Runtime
FROM ubuntu:22.04 AS runtime

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    libpqxx-6.4 \
    libpq5 \
    libssl3 \
    libsodium23 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash telemetry

# Copy binary from builder
COPY --from=builder /build/build/sos_telemetry_handler /usr/local/bin/

# Set permissions
RUN chmod +x /usr/local/bin/sos_telemetry_handler

# Switch to non-root user
USER telemetry
WORKDIR /home/telemetry

# Default command
CMD ["sos_telemetry_handler"]
