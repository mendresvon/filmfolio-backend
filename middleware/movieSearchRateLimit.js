const { createHash } = require("node:crypto");

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 60;
const MAX_LOCAL_BUCKETS = 10_000;

const INCREMENT_SCRIPT = `
  local count = redis.call("INCR", KEYS[1])
  local ttl = redis.call("PTTL", KEYS[1])
  if ttl < 0 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return { count, ttl }
`;

function makeKey(req) {
  const userId = req.user?.id;
  const ip = req.ip || req.socket?.remoteAddress;
  const subject =
    userId !== undefined && userId !== null && String(userId).trim()
      ? `user:${String(userId).trim()}`
      : `ip:${typeof ip === "string" && ip.trim() ? ip.trim() : "unknown"}`;
  const digest = createHash("sha256").update(subject).digest("hex");

  return `rate-limit:movie-search:${digest}`;
}

function incrementLocalCounter(counters, key, currentTime, windowMs) {
  let bucket = counters.get(key);

  if (!bucket || bucket.resetAt <= currentTime) {
    if (!bucket && counters.size >= MAX_LOCAL_BUCKETS) {
      counters.delete(counters.keys().next().value);
    }

    bucket = { count: 0, resetAt: currentTime + windowMs };
  }

  bucket.count += 1;
  counters.delete(key);
  counters.set(key, bucket);

  return {
    count: bucket.count,
    resetMs: Math.max(1, bucket.resetAt - currentTime),
  };
}

function createMovieSearchRateLimit(
  redisConnection,
  { maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS, now = Date.now } = {}
) {
  const localCounters = new Map();
  let warnedAboutRedis = false;

  return async function movieSearchRateLimit(req, res, next) {
    const key = makeKey(req);
    const client = redisConnection?.client ?? redisConnection ?? null;
    const redisIsAvailable =
      client &&
      typeof client.eval === "function" &&
      (typeof redisConnection?.isAvailable !== "boolean" || redisConnection.isAvailable);

    let counter;

    if (redisIsAvailable) {
      try {
        const result = await client.eval(INCREMENT_SCRIPT, 1, key, windowMs);
        const count = Number(result?.[0]);
        const resetMs = Number(result?.[1]);

        if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(resetMs) || resetMs < 0) {
          throw new Error("Redis rate limiter returned an invalid response");
        }

        counter = { count, resetMs: Math.max(1, resetMs) };
      } catch (error) {
        if (!warnedAboutRedis) {
          console.warn(`Movie search rate limiter using local fallback: ${error.message}`);
          warnedAboutRedis = true;
        }
      }
    }

    if (!counter) {
      counter = incrementLocalCounter(localCounters, key, now(), windowMs);
    }

    if (counter.count > maxRequests) {
      res.set("Retry-After", String(Math.max(1, Math.ceil(counter.resetMs / 1000))));
      return res.status(429).json({
        msg: "Too many movie searches. Please try again later.",
      });
    }

    return next();
  };
}

module.exports = createMovieSearchRateLimit;
