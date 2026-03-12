FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# host.docker.internal resolves to the host machine on Docker Desktop (Mac/Windows)
ENV OLLAMA_HOST=http://host.docker.internal:11434
ENV OLLAMA_MODEL=gpt-oss:20b

ENV DATA_DIR=/app/data

# 8001 = FastAPI / WebSocket (React app connects here)
# 8002 = MCP server (agent connects here internally)
EXPOSE 8001 8002

ENTRYPOINT ["./entrypoint.sh"]
