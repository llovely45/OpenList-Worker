import assert from "node:assert/strict"
import { test } from "node:test"
import { Hono } from "hono"
import { saveDb } from "../internal/model/db"
import { fsRouter } from "./fs"
import { rawRouter } from "./raw"

const ADMIN_TOKEN = "download-mode-admin-token"
const JWT_SECRET = "download-mode-jwt-secret"
const TARGET_URL = "https://cdn.example.test/video.mp4"
const env: any = {
  ADMIN_API_TOKEN: ADMIN_TOKEN,
  JWT_SECRET,
}

function buildApp() {
  const app = new Hono()
  app.route("/api/fs", fsRouter)
  app.route("/api/d", rawRouter)
  app.route("/api/p", rawRouter)
  return app
}

async function saveUrlTreeStorage(
  id: number,
  mountPath: string,
  webProxy: boolean,
  signAll = false,
) {
  await saveDb(
    {
      settings: signAll
        ? [
            { key: "sign_all", value: "true" },
            { key: "link_expiration", value: "3600" },
          ]
        : [],
      users: [],
      storages: [
        {
          id,
          mount_path: mountPath,
          driver: "UrlTree",
          web_proxy: webProxy,
          modified: `2026-09-06T00:00:00.00${id}Z`,
          addition: JSON.stringify({
            url_structure: `video.mp4:${TARGET_URL}`,
          }),
        },
      ],
      shares: [],
    },
    env,
  )
}

async function getPreviewUrl(app: Hono, path: string) {
  const response = await app.request(
    "/api/fs/get",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    },
    env,
  )
  assert.equal(response.status, 200)
  const json: any = await response.json()
  return json.data
}

test("direct mode returns a signed /api/d URL and the raw endpoint redirects", async () => {
  const app = buildApp()
  await saveUrlTreeStorage(9101, "/url-direct", false, true)

  const data = await getPreviewUrl(app, "/url-direct/video.mp4")
  const previewUrl = new URL(data.raw_url, "https://openlist.test")
  assert.equal(previewUrl.pathname, "/api/d/url-direct/video.mp4")
  assert.equal(previewUrl.searchParams.get("sign"), data.sign)

  const response = await app.request(
    data.raw_url,
    {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    },
    env,
  )
  assert.equal(response.status, 302)
  assert.equal(response.headers.get("location"), TARGET_URL)
})

test("proxy mode returns /api/p and streams the upstream response", async () => {
  const app = buildApp()
  await saveUrlTreeStorage(9102, "/url-proxy", true)

  const data = await getPreviewUrl(app, "/url-proxy/video.mp4")
  assert.equal(data.raw_url, "/api/p/url-proxy/video.mp4")

  const originalFetch = globalThis.fetch
  let upstreamCalls = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url === TARGET_URL) {
      upstreamCalls++
      const headers = new Headers(init?.headers)
      assert.equal(headers.get("Range"), null)
      return new Response("video bytes", {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": "11",
          "Accept-Ranges": "bytes",
        },
      })
    }
    return originalFetch(input, init)
  }) as typeof fetch

  try {
    const response = await app.request(
      data.raw_url,
      {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      },
      env,
    )
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "video bytes")
    assert.equal(upstreamCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
