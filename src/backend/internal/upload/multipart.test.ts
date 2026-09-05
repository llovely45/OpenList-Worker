import assert from "node:assert/strict"
import { test } from "node:test"
import {
  deleteSession,
  getMultipartChunkCount,
  getSession,
  putSession,
  type MultipartSession,
} from "./multipart"

test("multipart metadata rejects a file that would require too many chunk entries", () => {
  assert.equal(getMultipartChunkCount(4_096 * 1024 * 1024, 1024 * 1024), 4_096)
  assert.equal(
    getMultipartChunkCount(4_097 * 1024 * 1024, 1024 * 1024),
    null,
  )
  assert.equal(getMultipartChunkCount(Number.MAX_SAFE_INTEGER, 1), null)
})

const makeSession = (uploadId: string): MultipartSession => ({
  upload_id: uploadId,
  state: "receiving",
  attempt: 0,
  path: `/${uploadId}`,
  size: 1,
  chunk_size: 1,
  total_chunks: 1,
  received: new Set(),
  driver_session: "driver-session",
  partMd5s: [undefined],
  storage_driver: "test",
  created_at: Date.now(),
})

test("multipart session cache evicts old entries instead of growing without bound", () => {
  const prefix = `multipart-cache-${Date.now()}-${Math.random()}`
  const ids = Array.from({ length: 256 }, (_, index) => `${prefix}-${index}`)

  for (const id of ids) putSession(makeSession(id))

  assert.equal(getSession(ids[0]), undefined)
  assert.ok(getSession(ids.at(-1)!))

  for (const id of ids) deleteSession(id)
})
