# syntax=docker/dockerfile:1

# ── Builder stage ────────────────────────────────────────────────────────────
# Buildable independently via: docker build --target builder .
FROM rust:1.75-slim-bookworm@sha256:70c2a016184099262fd7cee46f3d35fec3568c45c62f87e37f7f665f766b1f74 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN rustup target add wasm32-unknown-unknown

WORKDIR /app

# Cache dependencies before copying full source
COPY Cargo.toml ./
COPY contracts/governance/Cargo.toml contracts/governance/Cargo.toml
COPY contracts/token/Cargo.toml contracts/token/Cargo.toml
RUN mkdir -p contracts/governance/src contracts/token/src \
    && echo 'pub fn main() {}' > contracts/governance/src/lib.rs \
    && echo 'pub fn main() {}' > contracts/token/src/lib.rs \
    && cargo fetch || true

COPY . .
RUN cargo build --release --target wasm32-unknown-unknown

# ── Runtime stage ────────────────────────────────────────────────────────────
# Buildable independently via: docker build --target runtime .
FROM debian:bookworm-slim@sha256:0104b334637a5f19aa9c983a91b54c89887c0984081f2068983107a6f6c21eeb AS runtime

# TARGETARCH is automatically set by BuildKit (amd64, arm64, ...)
ARG TARGETARCH

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Stellar CLI, selecting the tarball matching the target architecture
RUN set -eux; \
    case "${TARGETARCH}" in \
        amd64) STELLAR_ARCH="x86_64" ;; \
        arm64) STELLAR_ARCH="aarch64" ;; \
        *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -sSL "https://github.com/stellar/stellar-cli/releases/download/v22.0.1/stellar-cli-22.0.1-${STELLAR_ARCH}-unknown-linux-gnu.tar.gz" \
    | tar -xz -C /usr/local/bin

WORKDIR /app

# Copy only the compiled WASM artifacts from the builder
COPY --from=builder /app/target/wasm32-unknown-unknown/release/*.wasm ./wasm/

CMD ["stellar", "--version"]
