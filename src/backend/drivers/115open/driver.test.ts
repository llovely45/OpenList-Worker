import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { Pan115Driver } from "./driver"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test("rejects a whitespace-only directory name before calling 115", async () => {
  let fetches = 0
  globalThis.fetch = (async () => {
    fetches++
    return new Response(JSON.stringify({ state: true, code: 0, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch

  const driver = new Pan115Driver({
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
  })

  await assert.rejects(
    () => driver.mkdir("", "/   "),
    /115 网盘目录名称不能为空/,
  )
  assert.equal(fetches, 0)
})

test("uses a single leading slash when resolving a folder below the default root", async () => {
  const requests: Array<{ url: string; body: string }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: String(init?.body || ""),
    })

    if (String(input).endsWith("/open/folder/get_info")) {
      return new Response(
        JSON.stringify({
          state: true,
          code: 0,
          data: { file_id: "folder-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({ state: true, code: 0, data: [], count: 0 }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  const driver = new Pan115Driver({
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
  })

  await driver.list("/网课", "/网课")

  assert.equal(requests.length, 2)
  assert.equal(new URLSearchParams(requests[0].body).get("path"), "/网课")
})
