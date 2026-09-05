import assert from "node:assert/strict"
import { test } from "node:test"
import { appendDownloadSign } from "./sign"

test("appendDownloadSign adds an encoded sign to a relative raw URL", () => {
  assert.equal(
    appendDownloadSign(
      "/api/p/Google Drive/file.png",
      "1788693880.abcdef123456",
    ),
    "/api/p/Google%20Drive/file.png?sign=1788693880.abcdef123456",
  )
})

test("appendDownloadSign preserves an existing query string", () => {
  assert.equal(
    appendDownloadSign("/api/p/file.png?proxy=true", "1788693880.abcdef123456"),
    "/api/p/file.png?proxy=true&sign=1788693880.abcdef123456",
  )
})
