import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { redis, redisConfigured } from '../server/lib/redis.js';
assert.ok(redisConfigured, 'Use actual Supabase credentials; this test never accepts an in-memory store');
const key = 'integration:' + randomUUID();
try {
  await redis.set(key, 'one', 30);
  assert.equal(await redis.get(key), 'one');
  assert.equal(await redis.incr(key + ':count', 30), 1);
  assert.equal(await redis.incr(key + ':count', 30), 2);
  await redis.lpush(key + ':queue', 'first');
  await redis.lpush(key + ':queue', 'second');
  await redis.expire(key + ':queue', 30);
  assert.equal(await redis.rpop(key + ':queue'), 'first');
  assert.equal(await redis.rpop(key + ':queue'), 'second');
  assert.equal(await redis.rpop(key + ':queue'), null);
  await redis.expire(key, 0);
  assert.equal(await redis.get(key), null);
  console.log(JSON.stringify({persistent_storage: true, fifo: true, expiry: true, counter: true}));
} finally {
  for (const suffix of ['', ':count', ':queue']) await redis.del(key + suffix);
}
