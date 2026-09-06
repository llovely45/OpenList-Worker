import assert from "node:assert/strict"
import { test } from "node:test"
import { Hono } from "hono"
import { saveDb } from "../internal/model/db"
import { hashPassword } from "./auth"
import { webdavRouter } from "./webdav"

const TARGET_URL = "https://cdn.example.test/video.mp4"
const ADMIN_AUTH = `Basic ${Buffer.from("admin:test-password").toString("base64")}`

function buildApp() {
  const app = new Hono()
  app.route("/dav", webdavRouter)
  return app
}

async function saveStorage(
  id: number,
  policy: string,
  webProxy: boolean,
  downProxyUrl = "",
) {
  await saveDb(
    {
      settings: [],
      users: [
        {
          id: 1,
          username: "admin",
          password: await hashPassword("test-password"),
          role: 2,
          permission: 0,
          base_path: "/",
          disabled: false,
        },
      ],
      storages: [
        {
          id,
          mount_path: `/webdav-policy-${id}`,
          driver: "UrlTree",
          web_proxy: webProxy,
          webdav_policy: policy,
          down_proxy_url: downProxyUrl,
          modified: `2026-09-06T00:00:00.00${id}Z`,
          addition: JSON.stringify({
            url_structure: `video.mp4:${TARGET_URL}`,
          }),
        },
      ],
      shares: [],
    },
    {},
  )
}

function requestHeaders() {
  return { Authorization: ADMIN_AUTH }
}

test("WebDAV 302_redirect uses the driver's direct URL", async () => {
  await saveStorage(9201, "302_redirect", true)

  const response = await buildApp().request(
    "/dav/webdav-policy-9201/video.mp4",
    { headers: requestHeaders() },
  )

  assert.equal(response.status, 302)
  assert.equal(response.headers.get("location"), TARGET_URL)
})

test("WebDAV native_proxy streams the driver's response", async () => {
  await saveStorage(9202, "native_proxy", false)
  const originalFetch = globalThis.fetch
  let upstreamCalls = 0
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString()
    if (url === TARGET_URL) {
      upstreamCalls++
      assert.equal(init?.method, "GET")
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
    const response = await buildApp().request(
      "/dav/webdav-policy-9202/video.mp4",
      { headers: requestHeaders() },
    )
    assert.equal(response.status, 200)
    assert.equal(await response.text(), "video bytes")
    assert.equal(upstreamCalls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("WebDAV use_proxy_url redirects to the configured download proxy", async () => {
  await saveStorage(
    9203,
    "use_proxy_url",
    false,
    "https://download-proxy.example.test/",
  )

  const response = await buildApp().request(
    "/dav/webdav-policy-9203/video.mp4",
    { headers: requestHeaders() },
  )

  assert.equal(response.status, 302)
  assert.equal(
    response.headers.get("location"),
    "https://download-proxy.example.test/webdav-policy-9203/video.mp4",
  )
})
