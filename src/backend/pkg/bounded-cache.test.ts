import assert from "node:assert/strict"
import { test } from "node:test"
import { BoundedCache } from "./bounded-cache"

test("BoundedCache evicts the least recently used entry", () => {
  const cache = new BoundedCache<string, string>({
    maxEntries: 2,
    ttlMs: 60_000,
  })

  cache.set("a", "A")
  cache.set("b", "B")
  assert.equal(cache.get("a"), "A")
  cache.set("c", "C")

  assert.equal(cache.has("a"), true)
  assert.equal(cache.has("b"), false)
  assert.equal(cache.get("c"), "C")
  assert.equal(cache.size, 2)
})

test("BoundedCache expires entries and removes them from iteration", () => {
  let now = 1_000
  const cache = new BoundedCache<string, string>({
    maxEntries: 2,
    ttlMs: 100,
    now: () => now,
  })

  cache.set("a", "A")
  now = 1_101

  assert.equal(cache.get("a"), undefined)
  assert.equal(cache.size, 0)
  assert.deepEqual(Array.from(cache.entries()), [])
})
