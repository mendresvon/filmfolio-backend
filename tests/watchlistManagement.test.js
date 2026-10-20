const assert = require("node:assert/strict");
const { after, afterEach, before, mock, test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");
const Watchlist = require("../models/Watchlist");

process.env.JWT_SECRET = "watchlist-management-test-secret";
const userId = "507f1f77bcf86cd799439011";
const watchlistId = "507f191e810c19729de860ea";
const token = jwt.sign({ user: { id: userId } }, process.env.JWT_SECRET);
const app = express();
app.use(express.json());
app.use("/api/watchlists", require("../routes/watchlists"));
const server = app.listen(0, "127.0.0.1");

before(async () => {
  await new Promise((resolve) => server.once("listening", resolve));
});
afterEach(() => mock.restoreAll());
after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function request(method, id, authenticated = true) {
  return fetch(`http://127.0.0.1:${server.address().port}/api/watchlists/${id}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "PUT" ? { body: JSON.stringify({ name: "Updated watchlist" }) } : {}),
  });
}

for (const method of ["GET", "PUT", "DELETE"]) {
  test(`${method} treats malformed watchlist IDs as missing resources`, async () => {
    mock.method(console, "error", () => {});
    // Use real Mongoose casting, which rejects these IDs without a database connection.
    for (const id of ["not-an-id", "123", "g".repeat(24), "a".repeat(23), "a".repeat(25)]) {
      const response = await request(method, id);
      assert.equal(response.status, 404, id);
      assert.deepEqual(await response.json(), { msg: "Watchlist not found" });
    }
  });

  test(`${method} still requires authentication for malformed IDs`, async () => {
    const response = await request(method, "not-an-id", false);
    assert.equal(response.status, 401);
  });
}

for (const method of ["PUT", "DELETE"]) {
  test(`${method} preserves the missing-watchlist response for a valid ID`, async () => {
    mock.method(Watchlist, "findById", async () => null);
    const response = await request(method, watchlistId);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      msg: method === "PUT" ? "Watchlist not found" : "Not found",
    });
  });

  test(`${method} still rejects another user's watchlist without writing`, async () => {
    mock.method(Watchlist, "findById", async () => ({ user: "another-user" }));
    const update = mock.method(Watchlist, "findByIdAndUpdate", () => assert.fail("Unexpected update"));
    const response = await request(method, watchlistId);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { msg: "Not authorized" });
    assert.equal(update.mock.callCount(), 0);
  });

  test(`${method} keeps genuine database failures as server errors`, async () => {
    mock.method(console, "error", () => {});
    mock.method(Watchlist, "findById", async () => { throw new Error("Database unavailable"); });
    const response = await request(method, watchlistId);
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "Server Error");
  });
}

test("PUT still updates an owned watchlist with a valid ID", async () => {
  mock.method(Watchlist, "findById", async () => ({ user: userId }));
  mock.method(Watchlist, "findByIdAndUpdate", async (id, update, options) => {
    assert.equal(id, watchlistId);
    assert.deepEqual(update, { $set: { name: "Updated watchlist" } });
    assert.deepEqual(options, { new: true });
    return { _id: id, user: userId, ...update.$set };
  });
  const response = await request("PUT", watchlistId);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).name, "Updated watchlist");
});

test("DELETE still removes an owned watchlist with a valid ID", async () => {
  const deleteOne = mock.fn(async () => {});
  mock.method(Watchlist, "findById", async () => ({ user: userId, deleteOne }));
  const response = await request("DELETE", watchlistId);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { msg: "Watchlist removed" });
  assert.equal(deleteOne.mock.callCount(), 1);
});
