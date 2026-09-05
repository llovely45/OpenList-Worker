import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const USE_FETCH_PATH = join("src", "hooks", "useFetch.ts")

function replaceLegacyLoadingBlock(source, request, resetValue) {
  const lines = source.split("\n")
  let replaced = 0

  for (let index = 0; index < lines.length - 3; index++) {
    const line = lines[index]
    const indent = line.match(/^[ \t]*/)?.[0] || ""
    if (line.trim() !== `const data = await ${request}`) continue

    const condition = lines[index + 1]?.trim()
    if (
      condition !==
        "if (!fetch || (data as EmptyResp).code !== 401) {" &&
      condition !== "if (!fetch || data.code !== 401) {"
    ) {
      continue
    }

    let closing = index + 2
    while (closing < lines.length && lines[closing].trim() !== "}") {
      closing++
    }
    if (
      closing >= lines.length ||
      lines[closing].trim() !== "}" ||
      lines[closing + 1]?.trim() !== "return data"
    ) {
      continue
    }

    lines.splice(
      index,
      closing - index + 2,
      `${indent}try {`,
      `${indent}  return await ${request}`,
      `${indent}} finally {`,
      `${indent}  setLoading(${resetValue})`,
      `${indent}}`,
    )
    replaced++
    index += 4
  }

  return { source: lines.join("\n"), replaced }
}

export function patchUseFetchSource(source) {
  let result = source
  let replaced = 0

  for (const [request, resetValue] of [
    ["p(...arg)", "false"],
    ["p(key, ...arg)", "undefined"],
  ]) {
    const patched = replaceLegacyLoadingBlock(result, request, resetValue)
    result = patched.source
    replaced += patched.replaced
  }

  if (replaced === 0) {
    const alreadyPatched =
      result.includes("try {") &&
      result.includes("finally {") &&
      result.includes("setLoading(false)") &&
      result.includes("setLoading(undefined)")
    if (!alreadyPatched) {
      throw new Error(
        "官方前端 useFetch.ts 的 loading 代码结构未知，已停止构建以避免发布 401 永久转圈版本",
      )
    }
  }

  return result
}

/**
 * Apply Worker-specific frontend compatibility fixes to an official source
 * checkout.  The operation is deliberately idempotent so every build path
 * (local repo, sibling repo, or cloned repo) has the same behavior.
 */
export function applyFrontendPatches(repo) {
  const file = join(repo, USE_FETCH_PATH)
  const source = readFileSync(file, "utf8")
  const patched = patchUseFetchSource(source)
  if (patched !== source) writeFileSync(file, patched)
  return { changed: patched !== source, file }
}

const LEGACY_MINIFIED_LOADING_RE =
  /\b[\w$]+\.code\s*!==\s*401\s*\)\s*&&\s*[\w$]+\(\s*(?:!1|void 0)\s*\)/
const LEGACY_SOURCE_LOADING_RE =
  /\.code\s*!==\s*401[\s\S]{0,240}setLoading\(\s*(?:false|undefined)\s*\)/

function javascriptFiles(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(file)
      } else if (entry.isFile() && file.endsWith(".js")) {
        files.push(file)
      }
    }
  }
  visit(root)
  return files
}

/**
 * Reject a prebuilt dist that still contains the official frontend's 401
 * loading bug.  A dist directory has no source hook to patch safely, so
 * silently copying it would reintroduce the infinite spinner at deploy time.
 */
export function assertFrontendDistCompatible(dist) {
  for (const file of javascriptFiles(dist)) {
    const source = readFileSync(file, "utf8")
    if (
      LEGACY_MINIFIED_LOADING_RE.test(source) ||
      LEGACY_SOURCE_LOADING_RE.test(source)
    ) {
      throw new Error(
        `FRONTEND_DIST 包含旧版前端 401 loading 实现: ${file}。请改用 FRONTEND_REPO 让构建脚本先修补源码。`,
      )
    }
  }
}
