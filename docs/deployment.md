# Deployment Guide

## Local Development (Docker Compose)

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, SMTP credentials, Slack webhook

# 2. Start all services
docker compose up -d

# 3. Run migrations (first time only)
docker compose exec backend poetry run alembic upgrade head

# 4. Open dashboard
open http://localhost:3000
open http://localhost:8000/docs   # API docs
```

## Services and Ports

| Service | Port | Description |
|---------|------|-------------|
| TimescaleDB | 5432 | PostgreSQL 15 + TimescaleDB |
| Redis | 6379 | Cache and pub/sub |
| Backend | 8000 | FastAPI + alert worker |
| Frontend | 3000 | Next.js dashboard |

## Production Deployment (Single Server)

For a production deployment on a single VPS (e.g., DigitalOcean Droplet, EC2):

### 1. System requirements
- 2 CPU, 4GB RAM minimum
- Ubuntu 22.04 LTS
- Docker + Docker Compose

### 2. Set environment variables

```bash
# Generate a strong secret key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Edit .env
SECRET_KEY=<generated-key>
POSTGRES_PASSWORD=<strong-password>
CORS_ORIGINS=https://your-domain.com
```

### 3. Use production docker-compose override

Create `docker-compose.prod.yml`:
```yaml
services:
  backend:
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
  frontend:
    command: node server.js
    environment:
      NEXT_PUBLIC_API_URL: https://your-domain.com/api/v1
```

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 4. Nginx reverse proxy

```nginx
server {
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```

### 5. SSL with Certbot

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## Database Backups

```bash
# Backup
docker compose exec db pg_dump -U dottle dottle | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore
gunzip -c backup_20260412.sql.gz | docker compose exec -T db psql -U dottle dottle
```

## TimescaleDB Data Retention

Add this to your migration or run manually to auto-drop data older than 90 days:

```sql
SELECT add_retention_policy('spans', INTERVAL '90 days');
SELECT add_retention_policy('agent_sessions', INTERVAL '90 days');
SELECT add_retention_policy('tool_calls', INTERVAL '90 days');
```

## Scaling Considerations

The current architecture handles comfortably:
- ~100 concurrent agent sessions
- ~10,000 spans/minute
- ~1M spans/day

When you hit limits:
1. **Read bottleneck on metrics queries**: Add a Redis cache layer on the `/metrics/*` endpoints (5-minute TTL).
2. **Write bottleneck on ingest**: Replace direct DB writes with Kafka — the ingest router becomes a producer, add a consumer that does the DB writes.
3. **Storage**: Enable TimescaleDB compression for spans older than 7 days.
4. **Multi-region**: Add read replicas for dashboard queries; keep the ingest path on the primary.
