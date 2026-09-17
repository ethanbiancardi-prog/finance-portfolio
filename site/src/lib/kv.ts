import { Redis } from "@upstash/redis";

// Provisioned via Vercel's "KV" storage product (Upstash-backed under the
// hood, but it injects KV_REST_API_URL/TOKEN rather than the
// UPSTASH_REDIS_REST_URL/TOKEN names Redis.fromEnv() looks for) — so we
// build the client explicitly instead of relying on fromEnv(). Lazy-
// initialized so importing this module doesn't crash at build/import time
// before the env vars are provisioned.
let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL ?? "",
      token: process.env.KV_REST_API_TOKEN ?? "",
    });
  }
  return redis;
}

export function kvConfigured(): boolean {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
}
