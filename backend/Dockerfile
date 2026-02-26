# STAGE 1: Builder
FROM python:3.12-slim AS builder

WORKDIR /app

# Install GCC only in the builder stage
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Build wheels instead of installing directly
RUN pip wheel --no-cache-dir --wheel-dir /app/wheels -r requirements.txt
RUN pip install ansible
RUN ansible-galaxy collection install community.crypto

# STAGE 2: Final (Tiny)
FROM python:3.12-slim

WORKDIR /app

# Install only the runtime dependency
RUN apt-get update && apt-get install -y \
    openssh-client \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-built wheels from the builder stage
COPY --from=builder /app/wheels /wheels
RUN pip install --no-cache /wheels/*

COPY . .

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
