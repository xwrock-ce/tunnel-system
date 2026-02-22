# Backend Dockerfile (Go API + Python ML worker)

# ---- Build Go server ----
FROM golang:1.26 AS go-builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o /out/tunnel-server ./cmd/server


# ---- Runtime: Python environment for ML + Go binary ----
FROM python:3.11-slim

# System dependencies required by OpenCV / torch runtime
RUN apt-get -o Acquire::Retries=3 update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python dependency installation
RUN pip install uv

WORKDIR /app/backend

# Install Python ML dependencies
COPY pyproject.toml ./
RUN uv pip install --system -e .

# Copy ML modules and worker script
COPY app ./app
COPY ml_worker ./ml_worker

# Copy Go server binary
COPY --from=go-builder /out/tunnel-server /usr/local/bin/tunnel-server

# Prepare runtime directories
RUN mkdir -p /app/uploads /app/static /app/backend/data

EXPOSE 8000

CMD ["tunnel-server"]
