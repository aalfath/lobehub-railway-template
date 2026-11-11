# LobeHub Railway template: start script

Start script for the [LobeHub](https://github.com/lobehub/lobehub) template on Railway.

The template runs the official image `lobehub/lobehub:2.3.2` (pinned by digest). Nothing is built at deploy time. The service's start command unpacks [`railway-start.cjs`](railway-start.cjs) from an inline base64 blob and runs it. The script:

1. Fills in fixed defaults when they're unset: `FTS_SEARCH_PROVIDER=pg_like` (Railway Postgres has pgvector but not ParadeDB's `pg_search`), `S3_SET_ACL=0`, `LLM_VISION_IMAGE_USE_BASE64=1`, `REDIS_PREFIX`, `INTERNAL_APP_URL` and `APP_URL`.
2. Creates `JWKS_KEY` once, an RS256 key set that LobeHub uses to sign internal and OIDC tokens. It's stored in Postgres (`railway_template.settings`) and reused on every boot, because `${{secret()}}` can't generate an RSA key. If you set `JWKS_KEY` yourself, the script uses yours instead.
3. Sets the Railway Bucket's CORS rule to allow `APP_URL`, so browsers can upload with presigned URLs. Set `RAILWAY_SKIP_BUCKET_CORS=1` to skip this step.
4. Runs upstream's `/app/startServer.js`, which runs the database migrations and starts the server.

`scripts/start-command.sh` prints the start command for the current script.
