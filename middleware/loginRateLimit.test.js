const test = require("node:test");
const assert = require("node:assert/strict");
const createLoginRateLimit = require("./loginRateLimit");

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

async function runMiddleware(middleware, ip) {
  const response = makeResponse();
  let continued = false;

  await middleware({ ip }, response, () => {
    continued = true;
  });

  return { response, continued };
}

test("allows the configured number of requests and then returns 429", async () => {
  const limiter = createLoginRateLimit(null, { maxAttempts: 2, windowMs: 60_000 });

  assert.equal((await runMiddleware(limiter, "203.0.113.10")).continued, true);
  assert.equal((await runMiddleware(limiter, "203.0.113.10")).continued, true);

  const blocked = await runMiddleware(limiter, "203.0.113.10");
  assert.equal(blocked.continued, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.equal(blocked.response.headers["Retry-After"], "60");
  assert.match(blocked.response.body.msg, /Too many login attempts/);
});

test("resets the local counter after its window expires", async () => {
  let currentTime = 1_000;
  const limiter = createLoginRateLimit(null, {
    maxAttempts: 1,
    windowMs: 1_000,
    now: () => currentTime,
  });

  assert.equal((await runMiddleware(limiter, "203.0.113.11")).continued, true);
  assert.equal((await runMiddleware(limiter, "203.0.113.11")).continued, false);

  currentTime += 1_000;
  assert.equal((await runMiddleware(limiter, "203.0.113.11")).continued, true);
});

test("shares limits across middleware instances when Redis is available", async () => {
  const counts = new Map();
  const fakeRedis = {
    async eval(_script, _numberOfKeys, key, windowMs) {
      const bucket = counts.get(key) || { count: 0, resetMs: windowMs };
      bucket.count += 1;
      counts.set(key, bucket);
      return [bucket.count, bucket.resetMs];
    },
  };
  const firstInstance = createLoginRateLimit(fakeRedis, { maxAttempts: 1 });
  const secondInstance = createLoginRateLimit(fakeRedis, { maxAttempts: 1 });

  assert.equal((await runMiddleware(firstInstance, "203.0.113.12")).continued, true);
  assert.equal((await runMiddleware(secondInstance, "203.0.113.12")).continued, false);
});

test("falls back to a local counter when Redis fails", async () => {
  const failingRedis = {
    async eval() {
      throw new Error("Redis unavailable");
    },
  };
  const limiter = createLoginRateLimit(failingRedis, { maxAttempts: 1 });
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    assert.equal((await runMiddleware(limiter, "203.0.113.13")).continued, true);
    assert.equal((await runMiddleware(limiter, "203.0.113.13")).continued, false);
  } finally {
    console.warn = originalWarn;
  }
});
