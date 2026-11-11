// LobeHub on Railway: start wrapper (aalfath/lobehub-railway-template).
// Fills in fixed defaults, keeps one persistent JWKS_KEY in Postgres,
// sets the bucket CORS rule for browser uploads, then runs upstream's startServer.js.
'use strict';
const crypto = require('node:crypto');
const env = process.env;
const def = (k, v) => { if (env[k] === undefined || env[k] === '') env[k] = v; };

def('FTS_SEARCH_PROVIDER', 'pg_like');
def('S3_SET_ACL', '0');
def('LLM_VISION_IMAGE_USE_BASE64', '1');
def('REDIS_PREFIX', 'lobechat');
def('REDIS_TLS', '0');
if (!env.APP_URL && env.RAILWAY_PUBLIC_DOMAIN) env.APP_URL = 'https://' + env.RAILWAY_PUBLIC_DOMAIN;
def('INTERNAL_APP_URL', 'http://127.0.0.1:' + (env.PORT || '3210'));
if (env.S3_ENDPOINT && /storageapi\.dev|tigris/i.test(env.S3_ENDPOINT)) def('S3_ENABLE_PATH_STYLE', '0');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureJwks() {
  if (env.JWKS_KEY) return;
  if (!env.DATABASE_URL) { console.warn('[railway] DATABASE_URL not set; skipping JWKS_KEY'); return; }
  const { Client } = require('/app/node_modules/pg');
  for (let i = 1; i <= 30; i++) {
    const c = new Client({ connectionString: env.DATABASE_URL });
    try {
      await c.connect();
      await c.query('CREATE SCHEMA IF NOT EXISTS railway_template');
      await c.query('CREATE TABLE IF NOT EXISTS railway_template.settings (key text PRIMARY KEY, value text NOT NULL)');
      const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = privateKey.export({ format: 'jwk' });
      Object.assign(jwk, { use: 'sig', alg: 'RS256', kid: crypto.randomBytes(8).toString('hex') });
      await c.query('INSERT INTO railway_template.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
        ['JWKS_KEY', JSON.stringify({ keys: [jwk] })]);
      const r = await c.query('SELECT value FROM railway_template.settings WHERE key = $1', ['JWKS_KEY']);
      env.JWKS_KEY = r.rows[0].value;
      console.log('[railway] JWKS_KEY loaded from Postgres (kid ' + JSON.parse(env.JWKS_KEY).keys[0].kid + ')');
      return;
    } catch (e) {
      console.warn('[railway] waiting for Postgres (' + i + '/30): ' + e.message);
      await sleep(3000);
    } finally { try { await c.end(); } catch {} }
  }
  throw new Error('[railway] could not reach Postgres to load JWKS_KEY');
}

async function ensureBucketCors() {
  if (env.RAILWAY_SKIP_BUCKET_CORS === '1') return;
  if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return;
  try {
    const { S3Client, PutBucketCorsCommand } = require('/app/node_modules/@aws-sdk/client-s3');
    const s3 = new S3Client({
      endpoint: env.S3_ENDPOINT, region: env.S3_REGION || 'auto', forcePathStyle: env.S3_ENABLE_PATH_STYLE === '1',
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
    const origins = [env.APP_URL].filter(Boolean);
    await s3.send(new PutBucketCorsCommand({ Bucket: env.S3_BUCKET, CORSConfiguration: { CORSRules: [{
      AllowedOrigins: origins.length ? origins : ['*'], AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
      AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600 }] } }));
    console.log('[railway] bucket CORS set for ' + (origins[0] || '*'));
  } catch (e) {
    console.warn('[railway] could not set bucket CORS (uploads from the browser may fail): ' + e.message);
  }
}

(async () => {
  await ensureJwks();
  await ensureBucketCors();
  require('/app/startServer.js');
})().catch((e) => { console.error(e); process.exit(1); });
