const Redis = require("ioredis");

let client = null;
let isAvailable = false;

if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL, {
    connectTimeout: 5000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 2 ? null : 500),
    lazyConnect: true,
  });

  client.on("connect", () => {
    isAvailable = true;
    console.log("Redis connected successfully");
  });

  client.on("error", (err) => {
    isAvailable = false;
    console.warn(`Redis error: ${err.message}`);
  });

  client.connect().catch(() => {});
}

module.exports = {
  get client() {
    return client;
  },
  get isAvailable() {
    return isAvailable;
  },
};
