# STAGE 1: Builder (Compiles C-extensions)
FROM python:3.12-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# We build wheels for heavy items like cryptography/paramiko here
RUN pip wheel --no-cache-dir --wheel-dir /app/wheels -r requirements.txt

# STAGE 2: Final (The production image)
FROM python:3.12-slim
WORKDIR /app

# 1. Install runtime OS dependencies
RUN apt-get update && apt-get install -y \
    openssh-client \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# 2. Copy and install pre-built wheels from builder
COPY --from=builder /app/wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels

# 3. Install Ansible & MySQL support in ONE layer to save space
RUN pip install --no-cache-dir ansible-core pymysql && \
    ansible-galaxy collection install \
    community.crypto \
    ansible.posix \
    community.mysql \
    community.general

COPY . .

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
