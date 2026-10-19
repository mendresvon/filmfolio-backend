const assert = require("node:assert/strict");
const { after, afterEach, before, beforeEach, mock, test } = require("node:test");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

delete process.env.REDIS_URL;
process.env.JWT_SECRET = "auth-test-secret";
const redisConnection = require("../utils/redisClient");
// Keep these route tests independent of the login attempt limit.
Object.defineProperty(redisConnection, "client", {
  value: { eval: async () => [1, 900000] },
});
Object.defineProperty(redisConnection, "isAvailable", { value: true });

const app = express();
app.use(express.json());
app.use("/api/auth", require("../routes/auth"));
const server = app.listen(0, "127.0.0.1");
const email = "von@example.com";
const password = " secret123 ";
const hashedPassword = bcrypt.hashSync(password, 4);
let reads;
let saves;

before(async () => {
  await new Promise((resolve) => server.once("listening", resolve));
});

beforeEach(() => {
  reads = [];
  saves = [];
  mock.method(User, "findOne", async (query) => {
    reads.push(query);
    return null;
  });
  mock.method(User.prototype, "save", async function () {
    saves.push(this);
    return this;
  });
});

afterEach(() => mock.restoreAll());
after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function request(path, body) {
  return fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function assertInvalid(path, body, field) {
  const response = await request(path, body);
  assert.equal(response.status, 400, JSON.stringify(body));
  const result = await response.json();
  assert.ok(result.errors?.some((error) => error.path === field), JSON.stringify(result));
  assert.deepEqual(reads, [], "Invalid input must not query users");
  assert.deepEqual(saves, [], "Invalid input must not save users");
}

for (const path of ["/register", "/login"]) {
  test(`${path} rejects non-string and missing emails before database access`, async () => {
    for (const invalidEmail of [undefined, null, 123, true, {}, { $ne: null }, [], [email]]) {
      await assertInvalid(path, { email: invalidEmail, password }, "email");
    }
  });

  test(`${path} rejects non-string, empty, and missing passwords before database access`, async () => {
    for (const invalidPassword of [undefined, null, 123456, true, {}, [], [password], ""]) {
      await assertInvalid(path, { email, password: invalidPassword }, "password");
    }
  });

  test(`${path} requires credentials in the request body`, async () => {
    await assertInvalid(`${path}?email=${email}&password=secret123`, {}, "email");
    await assertInvalid(`${path}?password=secret123`, { email }, "password");
    await assertInvalid(path, undefined, "email");
  });

  test(`${path} still rejects malformed email addresses`, async () => {
    await assertInvalid(path, { email: "not-an-email", password }, "email");
  });
}

test("registration still enforces a six-character minimum", async () => {
  await assertInvalid("/register", { email, password: "12345" }, "password");
});

test("registration accepts valid credentials and hashes the exact password", async () => {
  const response = await request("/register", { email, password });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.msg, "User registered successfully");
  assert.deepEqual(reads, [{ email }]);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].email, email);
  assert.equal(await bcrypt.compare(password, saves[0].password), true);
  assert.equal(await bcrypt.compare(password.trim(), saves[0].password), false);
  assert.equal(result.userId, saves[0].id);
});

test("login accepts valid credentials and returns a signed five-hour token", async () => {
  mock.method(User, "findOne", async (query) => {
    reads.push(query);
    return { id: "test-user", password: hashedPassword };
  });
  const response = await request("/login", { email, password });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  assert.deepEqual(payload.user, { id: "test-user" });
  assert.equal(payload.exp - payload.iat, 5 * 60 * 60);
  assert.deepEqual(reads, [{ email }]);
  assert.deepEqual(saves, []);
});

test("login still rejects an incorrect string password", async () => {
  mock.method(User, "findOne", async () => ({ id: "test-user", password: hashedPassword }));
  const response = await request("/login", { email, password: "incorrect" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { msg: "Invalid credentials" });
});
