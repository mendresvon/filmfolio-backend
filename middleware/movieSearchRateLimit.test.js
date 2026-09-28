const test = require("node:test");
const assert = require("node:assert/strict");
const createMovieSearchRateLimit = require("./movieSearchRateLimit");

function makeResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function runMiddleware(middleware, userId, ip = "203.0.113.20") {
  const response = makeResponse();
  let continued = false;

  await middleware({ user: { id: userId }, ip }, response, () => {
    continued = true;
  });

  return { response, continued };
}

function createFakeRedis(now = Date.now) {
  const buckets = new Map();

  return {
    buckets,
    async eval(_script, numberOfKeys, key, windowMs) {
      assert.equal(numberOfKeys, 1);
      const currentTime = now();
      let bucket = buckets.get(key);

      if (!bucket || bucket.resetAt <= currentTime) {
        bucket = { count: 0, resetAt: currentTime + windowMs };
      }

      bucket.count += 1;
      buckets.set(key, bucket);

      return [bucket.count, Math.max(0, bucket.resetAt - currentTime)];
    },
  };
}

test("allows the configured number of requests then returns 429 with Retry-After", async () => {
  const limiter = createMovieSearchRateLimit(createFakeRedis(), {
    maxRequests: 2,
    windowMs: 60_000,
  });

  assert.equal((await runMiddleware(limiter, "user-1")).continued, true);
  assert.equal((await runMiddleware(limiter, "user-1")).continued, true);

  const blocked = await runMiddleware(limiter, "user-1");
  assert.equal(blocked.continued, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.equal(blocked.response.headers["Retry-After"], "60");
  assert.deepEqual(blocked.response.body, {
    msg: "Too many movie searches. Please try again later.",
  });
});

test("resets the Redis counter after its window expires", async () => {
  let currentTime = 1_000;
  const redis = createFakeRedis(() => currentTime);
  const limiter = createMovieSearchRateLimit(redis, {
    maxRequests: 1,
    windowMs: 1_000,
    now: () => currentTime,
  });

  assert.equal((await runMiddleware(limiter, "user-2")).continued, true);
  assert.equal((await runMiddleware(limiter, "user-2")).continued, false);

  currentTime += 1_000;
  assert.equal((await runMiddleware(limiter, "user-2")).continued, true);
});

test("shares the configured limit across middleware instances with Redis", async () => {
  const redis = createFakeRedis();
  const firstInstance = createMovieSearchRateLimit(redis, { maxRequests: 1 });
  const secondInstance = createMovieSearchRateLimit(redis, { maxRequests: 1 });

  assert.equal((await runMiddleware(firstInstance, "user-3")).continued, true);

  const blocked = await runMiddleware(secondInstance, "user-3");
  assert.equal(blocked.continued, false);
  assert.equal(blocked.response.statusCode, 429);
});

test("uses a local counter and resets it when Redis fails", async () => {
  let currentTime = 5_000;
  const unavailableRedis = {
    async eval() {
      throw new Error("Redis unavailable");
    },
  };
  const limiter = createMovieSearchRateLimit(unavailableRedis, {
    maxRequests: 1,
    windowMs: 2_000,
    now: () => currentTime,
  });
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    assert.equal((await runMiddleware(limiter, "user-4")).continued, true);

    const blocked = await runMiddleware(limiter, "user-4");
    assert.equal(blocked.continued, false);
    assert.equal(blocked.response.statusCode, 429);
    assert.equal(blocked.response.headers["Retry-After"], "2");

    currentTime += 2_000;
    assert.equal((await runMiddleware(limiter, "user-4")).continued, true);
  } finally {
    console.warn = originalWarn;
  }
});

test("uses separate limits for different authenticated users on the same IP", async () => {
  const limiter = createMovieSearchRateLimit(createFakeRedis(), { maxRequests: 1 });

  assert.equal((await runMiddleware(limiter, "user-5")).continued, true);
  assert.equal((await runMiddleware(limiter, "user-6")).continued, true);
});
