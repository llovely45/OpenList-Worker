import assert from "node:assert/strict"
import { test } from "node:test"
import { Hono } from "hono"

import { getDb, saveDb } from "../internal/model/db"
import { adminRouter } from "./admin"

test("115 Open repair endpoint canonicalizes only enabled 115 Open storages", async () => {
  const env: any = { ADMIN_API_TOKEN: "admin-token" }
  const addition = '{"access_token":"[REDACTED]","refresh_token":"[REDACTED]"}'
  await saveDb(
    {
      settings: [{ key: "token", value: "admin-token" }],
      users: [],
      storages: [
        {
          id: 1,
          driver: "115OPEN",
          mount_path: "/115",
          addition,
          modified: "2026-09-05T00:00:00.000Z",
          disabled: false,
        },
        {
          id: 2,
          driver: "115Share",
          mount_path: "/115-share",
          addition: "{}",
          modified: "2026-09-05T00:00:00.000Z",
          disabled: false,
        },
        {
          id: 3,
          driver: "115Open",
          mount_path: "/115-disabled",
          addition: "{}",
          modified: "2026-09-05T00:00:00.000Z",
          disabled: true,
        },
      ],
      shares: [],
    },
    env,
  )

  const app = new Hono()
  app.route("/api/admin", adminRouter)
  const response = await app.request(
    "/api/admin/driver/115open/repair",
    {
      method: "POST",
      headers: { Authorization: "Bearer admin-token" },
    },
    env,
  )

  assert.equal(response.status, 200)
  const body: any = await response.json()
  assert.equal(body.code, 200)
  assert.equal(body.data.matched, 2)
  assert.equal(body.data.repaired, 1)
  assert.equal(body.data.skipped, 1)

  const db = await getDb(env)
  const repaired = db.storages.find((storage: any) => storage.id === 1)
  assert.equal(repaired.driver, "115Open")
  assert.notEqual(repaired.modified, "2026-09-05T00:00:00.000Z")
  assert.equal(repaired.addition, addition)

  const share = db.storages.find((storage: any) => storage.id === 2)
  assert.equal(share.driver, "115Share")
  const disabled = db.storages.find((storage: any) => storage.id === 3)
  assert.equal(disabled.driver, "115Open")
})

test("admin API uses ADMIN_API_TOKEN and never reuses the 115 token setting", async () => {
  const env: any = { ADMIN_API_TOKEN: "dedicated-admin-token" }
  await saveDb(
    {
      settings: [{ key: "token", value: "115-provider-token" }],
      users: [],
      storages: [],
      shares: [],
    },
    env,
  )

  const app = new Hono()
  app.route("/api/admin", adminRouter)

  const dedicatedTokenResponse = await app.request(
    "/api/admin/driver/115open/repair",
    {
      method: "POST",
      headers: { Authorization: "Bearer dedicated-admin-token" },
    },
    env,
  )
  assert.equal(dedicatedTokenResponse.status, 200)
  const dedicatedBody: any = await dedicatedTokenResponse.json()
  assert.equal(dedicatedBody.code, 200)

  const providerTokenResponse = await app.request(
    "/api/admin/driver/115open/repair",
    {
      method: "POST",
      headers: { Authorization: "Bearer 115-provider-token" },
    },
    env,
  )
  assert.equal(providerTokenResponse.status, 200)
  const body: any = await providerTokenResponse.json()
  assert.equal(body.code, 401)
})
