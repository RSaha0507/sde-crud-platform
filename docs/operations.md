# Deployment and Operations

## Local container deployment

From the repository root:

```bash
docker compose up --build
```

The frontend is available at `http://localhost:8080`, the API at
`http://localhost:4000`, and the SQLite data volume is named `backend-data`.
Stop the stack with `docker compose down`; use `docker compose down -v` only
when intentionally deleting the database and model definitions.

## Health checks

- `GET /healthz` is a liveness check. It confirms that the process can serve HTTP.
- `GET /readyz` is a readiness check. It waits for model loading and verifies SQLite.

Only route traffic to an instance after `/readyz` returns HTTP 200. A 503 response
means the instance should be removed from service and investigated.

## Configuration

Copy `backend/.env.example` to a deployment environment and set:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `4000`) |
| `DB_FILE` | SQLite database path |
| `MODELS_DIR` | Persistent model-definition directory |
| `CORS_ORIGIN` | Comma-separated trusted origins |
| `BODY_LIMIT` | JSON request limit |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | Per-IP request budget |
| `TRUST_PROXY` | Enable only behind a trusted proxy |

Each response includes an `X-Request-Id` header. Clients may supply a request ID
for correlation; otherwise the service generates one. Request completion and
unexpected errors are emitted as JSON log records with the request ID.

## Shutdown and incident response

SIGINT and SIGTERM stop accepting new connections, close the HTTP server, and
then close SQLite before exiting. Allow the configured orchestrator grace period
to elapse before force-killing a container. Preserve request-ID logs and the
`/readyz` transition when investigating failures.
