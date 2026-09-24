const { createHash } = require("node:crypto");

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
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

function makeKey(ip) {
  const address = typeof ip === "string" && ip.trim() ? ip.trim() : "unknown";
  const digest = createHash("sha256").update(address).digest("hex");
  return `rate-limit:login:${digest}`;
}

function incrementLocalCounter(counters, key, now, windowMs) {
  let bucket = counters.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && counters.size >= MAX_LOCAL_BUCKETS) {
      counters.delete(counters.keys().next().value);
    }

    bucket = { count: 0, resetAt: now + windowMs };
  }

  bucket.count += 1;
  counters.delete(key);
  counters.set(key, bucket);

  return {
    count: bucket.count,
    resetMs: Math.max(1, bucket.resetAt - now),
  };
}

function createLoginRateLimit(
  redisConnection,
  { maxAttempts = MAX_ATTEMPTS, windowMs = WINDOW_MS, now = Date.now } = {}
) {
  const localCounters = new Map();
  let warnedAboutRedis = false;

  return async function loginRateLimit(req, res, next) {
    const key = makeKey(req.ip || req.socket?.remoteAddress);
    const client = redisConnection?.client ?? redisConnection ?? null;
    const redisIsAvailable =
      client &&
      (typeof redisConnection?.isAvailable !== "boolean" || redisConnection.isAvailable);

    let counter;

    if (redisIsAvailable) {
      try {
        const [count, resetMs] = await client.eval(INCREMENT_SCRIPT, 1, key, windowMs);
        counter = { count: Number(count), resetMs: Number(resetMs) };
      } catch (error) {
        if (!warnedAboutRedis) {
          console.warn(`Login rate limiter using local fallback: ${error.message}`);
          warnedAboutRedis = true;
        }
      }
    }

    if (!counter) {
      counter = incrementLocalCounter(localCounters, key, now(), windowMs);
    }

    if (counter.count > maxAttempts) {
      res.set("Retry-After", String(Math.max(1, Math.ceil(counter.resetMs / 1000))));
      return res.status(429).json({
        msg: "Too many login attempts. Please try again later.",
      });
    }

    return next();
  };
}

module.exports = createLoginRateLimit;
