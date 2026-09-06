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

test("uses file metadata from folder info when the directory listing omits the pick code", async () => {
  const requests: Array<{ url: string; body: string }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = String(init?.body || "")
    requests.push({ url, body })

    if (url.endsWith("/open/folder/get_info")) {
      const path = new URLSearchParams(body).get("path")
      if (path === "/网课/导数与微分02.mp4") {
        return new Response(
          JSON.stringify({
            state: true,
            code: 0,
            data: [
              {
                count: 0,
                size: "12",
                size_byte: 12,
                folder_count: 0,
                ptime: "2026-09-06 00:00:00",
                utime: "2026-09-06 00:00:00",
                file_name: "导数与微分02.mp4",
                pick_code: "pick-file-1",
                sha1: "sha1-file-1",
                file_id: "file-1",
                file_category: "1",
                paths: [],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }

      return new Response(
        JSON.stringify({
          state: true,
          code: 0,
          data: { file_id: "folder-1" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    if (url.endsWith("/open/ufile/downurl")) {
      assert.equal(new URLSearchParams(body).get("pick_code"), "pick-file-1")
      return new Response(
        JSON.stringify({
          state: true,
          code: 0,
          data: {
            "file-1": {
              file_name: "导数与微分02.mp4",
              file_size: 12,
              pick_code: "pick-file-1",
              sha1: "sha1-file-1",
              url: { url: "https://cdn.example.test/video.mp4" },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({
        state: true,
        code: 0,
        data: [
          {
            fid: "file-1",
            pid: "folder-1",
            fc: "1",
            fn: "导数与微分02.mp4",
            pc: "",
            upt: 0,
            uppt: 0,
            sha1: "sha1-file-1",
            fs: 12,
            thumbnail: "",
            fco: "",
          },
        ],
        count: 1,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )
  }) as typeof fetch

  const driver = new Pan115Driver({
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
  })

  const item = await driver.get("", "/网课/导数与微分02.mp4")

  assert.equal(item.raw_url, "https://cdn.example.test/video.mp4")
  assert.equal(
    requests.filter((request) => request.url.endsWith("/open/ufile/downurl"))
      .length,
    1,
  )
})
