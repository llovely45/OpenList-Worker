import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { Hono } from "hono"
import { sign } from "hono/jwt"
import { saveDb } from "../internal/model/db"
import { verifyDownloadSign } from "../pkg/sign"
import { fsRouter } from "./fs"

test("fs/get includes the download sign in raw_url", async () => {
  const root = await mkdtemp(join(tmpdir(), "openlist-sign-"))
  const env: any = { JWT_SECRET: "test-jwt-secret-for-download-sign" }

  try {
    await writeFile(join(root, "file.png"), "test image")
    await saveDb(
      {
        settings: [
          { key: "sign_all", value: "true" },
          { key: "link_expiration", value: "3600" },
        ],
        users: [
          {
            id: 1,
            username: "guest",
            password: "",
            role: 1,
            permission: 0,
            base_path: "/",
            disabled: false,
          },
        ],
        storages: [
          {
            id: 1,
            mount_path: "/x",
            driver: "local",
            addition: JSON.stringify({ root_folder_path: root }),
            disabled: false,
          },
        ],
        shares: [],
      },
      env,
    )

    const app = new Hono()
    app.route("/api/fs", fsRouter)
    const guestToken = await sign(
      { id: 1, username: "guest", role: 1 },
      env.JWT_SECRET,
    )
    const res = await app.request(
      "/api/fs/get",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${guestToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: "/x/file.png" }),
      },
      env,
    )

    assert.equal(res.status, 200)
    const json: any = await res.json()
    const rawUrl = new URL(json.data.raw_url, "https://openlist.test")
    assert.equal(rawUrl.pathname, "/api/p/x/file.png")
    assert.equal(rawUrl.searchParams.get("sign"), json.data.sign)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("fs/link includes the download sign in its proxy fallback URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "openlist-sign-link-"))
  const env: any = {
    JWT_SECRET: "test-jwt-secret-for-download-sign",
    ADMIN_API_TOKEN: "admin-token",
  }

  try {
    await writeFile(join(root, "file.png"), "test image")
    await saveDb(
      {
        settings: [
          { key: "sign_all", value: "true" },
          { key: "link_expiration", value: "3600" },
        ],
        users: [],
        storages: [
          {
            id: 1,
            mount_path: "/x",
            driver: "local",
            addition: JSON.stringify({ root_folder_path: root }),
            disabled: false,
          },
        ],
        shares: [],
      },
      env,
    )

    const app = new Hono()
    app.route("/api/fs", fsRouter)
    const res = await app.request(
      "/api/fs/link",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: "/x/file.png" }),
      },
      env,
    )

    assert.equal(res.status, 200)
    const json: any = await res.json()
    const proxyUrl = new URL(json.data.url, "https://openlist.test")
    assert.equal(proxyUrl.pathname, "/api/p/x/file.png")
    const sign = proxyUrl.searchParams.get("sign")
    assert.ok(sign)
    assert.equal(await verifyDownloadSign({ env }, "/x/file.png", sign), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
