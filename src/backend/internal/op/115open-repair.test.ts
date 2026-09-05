import assert from "node:assert/strict"
import { test } from "node:test"

import { is115OpenDriverName, repair115OpenStorage } from "./115open-repair"

test("recognizes 115 Open Platform aliases but not share storage", () => {
  assert.equal(is115OpenDriverName("115OPEN"), true)
  assert.equal(is115OpenDriverName("115-Open"), true)
  assert.equal(is115OpenDriverName("115Pan"), true)
  assert.equal(is115OpenDriverName("115Share"), false)
})

test("repairs a storage without changing its credentials or mount path", () => {
  const storage = {
    id: 7,
    driver: "115OPEN",
    mount_path: "/115",
    addition: '{"access_token":"[REDACTED]"}',
    status: "[115] API error ()",
    modified: "2026-09-05T00:00:00.000Z",
  }

  const repaired = repair115OpenStorage(storage, "2026-09-05T01:00:00.000Z")

  assert.deepEqual(repaired, {
    ...storage,
    driver: "115Open",
    modified: "2026-09-05T01:00:00.000Z",
  })
  assert.equal(storage.driver, "115OPEN")
  assert.equal(storage.addition, '{"access_token":"[REDACTED]"}')
})
