# AccessWork: React UI + local Whisper + Piper, one container.
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json .oxlintrc.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AW_HOST=0.0.0.0 \
    AW_PORT=8765 \
    AW_WHISPER_MODEL=base \
    AW_PIPER_PYTHON=/usr/local/bin/python3 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg espeak-ng nginx ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
# Large CPU wheel: curl retries instead of pip's short HTTPS read timeout.
# Filename must keep the PEP 427 tags or pip rejects the file.
ARG TORCH_WHL=https://download.pytorch.org/whl/cpu/torch-2.14.1%2Bcpu-cp312-cp312-manylinux_2_28_x86_64.whl
ARG TORCH_FILE=torch-2.14.1+cpu-cp312-cp312-manylinux_2_28_x86_64.whl
RUN curl -fL --retry 12 --retry-all-errors --retry-delay 5 --connect-timeout 30 \
      -o "/tmp/${TORCH_FILE}" "$TORCH_WHL"
RUN pip install --no-cache-dir --timeout 300 "/tmp/${TORCH_FILE}" \
    && rm -f "/tmp/${TORCH_FILE}"
RUN pip install --no-cache-dir --retries 10 --timeout 300 -r requirements.txt
RUN python -c "import whisper; whisper.load_model('base')"

COPY server ./server
COPY --from=web /web/dist ./dist
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=8 \
  CMD curl -fsS http://127.0.0.1/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
