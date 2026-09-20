# Security Policy

## Supported versions

The latest default branch is the only supported version. Deployments should use a
recent LTS Node.js release and keep the pinned dependencies current.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Report it
privately to the repository maintainers with reproduction steps, affected
versions, and impact. Include logs or proof-of-concept material only when it
does not contain real credentials or personal data.

We will acknowledge reports as soon as practical, investigate, and coordinate a
fix and disclosure timeline with the reporter.

## Deployment security baseline

- Set `CORS_ORIGIN` to the exact trusted frontend origin(s); do not use `*` in production.
- Keep `DB_FILE` and `MODELS_DIR` on a persistent volume that is not publicly served.
- Set `TRUST_PROXY=true` only when the application is behind a trusted reverse proxy.
- Review rate-limit and body-size settings for the expected workload.
- Run the service as the non-root container user and terminate it with SIGTERM for graceful shutdown.
