import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import {
  applyFrontendPatches,
  assertFrontendDistCompatible,
} from "./frontend-patch.mjs"

test("frontend patch clears loading after a 401 and is idempotent", async () => {
  const repo = await mkdtemp(join(tmpdir(), "openlist-frontend-patch-"))
  try {
    const hooks = join(repo, "src", "hooks")
    await mkdir(hooks, { recursive: true })
    const source = `export const useLoading = async (...arg) => {
  setLoading(true)
  const data = await p(...arg)
  if (!fetch || data.code !== 401) {
    setLoading(false)
  }
  return data
}

const useListLoading = async (...arg) => {
  setLoading(key)
  const data = await p(key, ...arg)
  if (!fetch || data.code !== 401) {
    setLoading(undefined)
  }
  return data
}
`
    const file = join(hooks, "useFetch.ts")
    await writeFile(file, source)

    await applyFrontendPatches(repo)
    const once = await readFile(file, "utf8")
    await applyFrontendPatches(repo)
    const twice = await readFile(file, "utf8")

    assert.equal(twice, once)
    assert.match(twice, /try \{/)
    assert.match(twice, /finally \{/)
    assert.doesNotMatch(twice, /data\.code !== 401/)
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})

test("prebuilt frontend dist rejects the legacy 401 loading implementation", async () => {
  const dist = await mkdtemp(join(tmpdir(), "openlist-frontend-dist-"))
  try {
    await writeFile(join(dist, "index.html"), "<!doctype html>")
    await writeFile(
      join(dist, "assets.js"),
      "const data=await p();return(!t||data.code!==401)&&i(!1),data",
    )

    assert.throws(
      () => assertFrontendDistCompatible(dist),
      /FRONTEND_DIST.*旧版前端|legacy frontend/i,
    )
  } finally {
    await rm(dist, { recursive: true, force: true })
  }
})
