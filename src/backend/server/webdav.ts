import { Hono } from "hono"
import { authUserFromReq, getOrInitUsers, hashPassword } from "./auth"
import { can, PermissionBit } from "../pkg/permission"
import {
  listItems,
  getItem,
  putItem,
  makeDirectory,
  removeItems,
  moveItems,
  copyItems,
} from "../internal/op/storage"
import { normalizeWebdavPolicy } from "../internal/op/storage"
import { resolvePath } from "../internal/model/db"
import { buildWebDavPropfindResponse } from "../internal/webdav/webdav"
import { safeErrorMessage } from "../pkg/errs"
import { assertSafeUrl } from "../pkg/http"
import {
  appendDownloadSign,
  getSignPolicy,
  signDownloadPath,
} from "../pkg/sign"

/**
 * WebDAV 协议服务（挂载于 /dav/*）。
 *
 * 认证：Basic Auth（用户名/密码）或 Bearer token（全局 token）。
 * 权限：WEBDAV_READ（读/列目录）与 WEBDAV_MANAGE（写/删/移动/复制）按位校验。
 * 支持方法：OPTIONS / PROPFIND / GET / HEAD / PUT / MKCOL / DELETE / MOVE / COPY。
 */

export const webdavRouter = new Hono()

const getStorageRequestContext = (c: any) => {
  try {
    const executionCtx = c.executionCtx
    if (!executionCtx || typeof executionCtx.waitUntil !== "function") {
      return undefined
    }
    return { waitUntil: (p: Promise<unknown>) => executionCtx.waitUntil(p) }
  } catch {
    return undefined
  }
}

/** Basic Auth 或 Bearer token 认证，返回用户对象（未认证返回 null） */
async function webdavAuth(c: any): Promise<any> {
  const authHeader = c.req.header("Authorization") || ""
  if (authHeader.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.substring(6).trim())
      const idx = decoded.indexOf(":")
      if (idx < 0) return null
      const username = decoded.substring(0, idx)
      const password = decoded.substring(idx + 1)
      const { users } = await getOrInitUsers(c.env)
      const user = users.find(
        (u: any) => u.username === username && !u.disabled,
      )
      if (!user) return null
      // 空密码用户（guest）：Basic Auth 下若未提供密码则允许（与 AList 一致）
      if (!user.password) {
        return password === "" ? user : null
      }
      const hashed = await hashPassword(password)
      if (user.password.length === 64 && user.password === hashed) return user
      return null
    } catch {
      return null
    }
  }
  if (authHeader.startsWith("Bearer ")) {
    const auth = await authUserFromReq(c)
    return auth ? auth.user : null
  }
  return null
}

/** 从 URL pathname 中剥离 /dav 前缀，得到虚拟文件路径 */
function davPathOf(c: any): string {
  const pathname = new URL(c.req.url).pathname
  let p = pathname.replace(/^\/dav/, "")
  if (!p) p = "/"
  try {
    return decodeURIComponent(p)
  } catch {
    return p
  }
}

/** 拆分虚拟路径为 { dir, name } */
function splitPath(p: string): { dir: string; name: string } {
  const clean = p.startsWith("/") ? p : "/" + p
  const parts = clean.split("/").filter(Boolean)
  const name = parts.pop() || ""
  const dir = "/" + parts.join("/")
  return { dir, name }
}

const DEFAULT_PROXY_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function encodePath(path: string): string {
  return (
    "/" +
    path
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/")
  )
}

async function buildConfiguredProxyUrl(
  c: any,
  storage: any,
  virtualPath: string,
): Promise<string> {
  const base = String(storage?.down_proxy_url || "")
    .split("\n")[0]
    .trim()
  if (!base) return ""

  const joined = `${base.replace(/\/$/, "")}${encodePath(virtualPath)}`
  const signPolicy = await getSignPolicy(c)
  if (!signPolicy.enabled) return joined

  const sign = await signDownloadPath(c, virtualPath, signPolicy.expiresIn)
  return appendDownloadSign(joined, sign)
}

function setForwardedResponseHeaders(c: any, response: Response): void {
  const headers = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
    "content-disposition",
  ]
  for (const name of headers) {
    const value = response.headers.get(name)
    if (value) c.header(name, value.replace(/[\r\n\u0000-\u001f]+/g, ""))
  }
}

async function proxyWebdavFile(c: any, item: any): Promise<Response> {
  if (!item?.raw_url) {
    return c.text(
      item?.raw_url_error || "The storage driver did not return a download URL",
      404,
    )
  }

  try {
    assertSafeUrl(item.raw_url, "WebDAV proxy download")
  } catch (error: any) {
    return c.text(error?.message || "SSRF blocked", 403)
  }

  const headers: Record<string, string> = { ...(item.raw_url_headers || {}) }
  if (!headers["User-Agent"]) headers["User-Agent"] = DEFAULT_PROXY_USER_AGENT
  const range = c.req.header("Range")
  if (range) headers.Range = range

  let upstream = await fetch(item.raw_url, {
    method: c.req.method,
    headers,
  })
  if (upstream.status === 412 && range) {
    delete headers.Range
    upstream = await fetch(item.raw_url, {
      method: c.req.method,
      headers,
    })
  }

  setForwardedResponseHeaders(c, upstream)
  c.header("Access-Control-Allow-Origin", "*")
  return c.body(upstream.body as any, upstream.status as any)
}

async function getWebdavFileResponse(
  c: any,
  davPath: string,
  item: any,
  rawUrl: string,
): Promise<Response> {
  const resolved = await resolvePath(davPath)
  const policy = normalizeWebdavPolicy(resolved.storage?.webdav_policy)

  if (policy === "302_redirect") {
    const location = item.raw_url || rawUrl
    if (!location)
      return c.text("The storage driver did not return a download URL", 404)
    try {
      assertSafeUrl(location, "WebDAV redirect download")
    } catch (error: any) {
      return c.text(error?.message || "SSRF blocked", 403)
    }
    return c.redirect(location, 302)
  }

  if (policy === "use_proxy_url") {
    const proxyUrl = await buildConfiguredProxyUrl(c, resolved.storage, davPath)
    if (proxyUrl) return c.redirect(proxyUrl, 302)
  }

  return proxyWebdavFile(c, item)
}

webdavRouter.all("/*", async (c) => {
  const user = await webdavAuth(c)
  if (!user) {
    return c.text("Unauthorized", 401, {
      "WWW-Authenticate": 'Basic realm="OpenList"',
    })
  }
  const canRead = can(user, PermissionBit.WEBDAV_READ)
  const canManage = can(user, PermissionBit.WEBDAV_MANAGE)
  if (!canRead && !canManage) {
    return c.text("Forbidden", 403)
  }

  const method = c.req.method.toUpperCase()
  const davPath = davPathOf(c)
  const ctx = getStorageRequestContext(c)

  try {
    switch (method) {
      case "OPTIONS": {
        c.header("DAV", "1, 2")
        c.header(
          "Allow",
          "OPTIONS, PROPFIND, GET, HEAD, PUT, MKCOL, DELETE, MOVE, COPY",
        )
        c.header("MS-Author-Via", "DAV")
        return c.body(null, 200)
      }

      case "PROPFIND": {
        if (!canRead) return c.text("Forbidden", 403)
        const depth = c.req.header("Depth") || "1"
        const res = await listItems(davPath, ctx)
        const items = (res.content || []).map((it: any) => ({
          name: it.name,
          size: it.size || 0,
          isFolder: !!it.is_dir,
          modified: it.modified || new Date().toISOString(),
        }))
        const href =
          davPath === "/"
            ? "/"
            : davPath.endsWith("/")
              ? davPath
              : davPath + "/"
        const xml = buildWebDavPropfindResponse(href, items)
        return c.body(xml, depth === "0" ? 207 : 207, {
          "Content-Type": "application/xml; charset=utf-8",
        })
      }

      case "GET":
      case "HEAD": {
        if (!canRead) return c.text("Forbidden", 403)
        const { item, rawUrl } = await getItem(davPath, ctx)
        if (!item) return c.text("Not found", 404)
        if (item.is_dir) return c.text("Is a directory", 400)
        // Match the Go WebDAV handler: webdav_policy, not web_proxy, selects
        // 302 redirect, configured proxy URL, or native proxy streaming.
        return getWebdavFileResponse(c, davPath, item, rawUrl)
      }

      case "PUT": {
        if (!canManage) return c.text("Forbidden", 403)
        const buffer = Buffer.from(await c.req.arrayBuffer())
        await putItem(davPath, buffer, ctx)
        return c.body(null, 201)
      }

      case "MKCOL": {
        if (!canManage) return c.text("Forbidden", 403)
        await makeDirectory(davPath, ctx)
        return c.body(null, 201)
      }

      case "DELETE": {
        if (!canManage) return c.text("Forbidden", 403)
        const { dir, name } = splitPath(davPath)
        await removeItems(dir, [name], ctx)
        return c.body(null, 204)
      }

      case "MOVE": {
        if (!canManage) return c.text("Forbidden", 403)
        const destRaw = c.req.header("Destination") || ""
        let dest = destRaw
        try {
          dest = decodeURIComponent(
            new URL(destRaw, c.req.url).pathname,
          ).replace(/^\/dav/, "")
        } catch {}
        const src = splitPath(davPath)
        const dst = splitPath(dest)
        await moveItems(src.dir, dst.dir, [src.name], ctx)
        return c.body(null, 201)
      }

      case "COPY": {
        if (!canManage) return c.text("Forbidden", 403)
        const destRaw = c.req.header("Destination") || ""
        let dest = destRaw
        try {
          dest = decodeURIComponent(
            new URL(destRaw, c.req.url).pathname,
          ).replace(/^\/dav/, "")
        } catch {}
        const src = splitPath(davPath)
        const dst = splitPath(dest)
        await copyItems(src.dir, dst.dir, [src.name], ctx)
        return c.body(null, 201)
      }

      case "LOCK":
      case "UNLOCK":
        // 简化实现：声明不支持锁，客户端通常可继续无锁操作
        return c.text("Locking not supported", 405)

      default:
        return c.text("Method Not Allowed", 405)
    }
  } catch (e: any) {
    const msg = safeErrorMessage(e)
    if (msg.includes("not found") || msg.includes("storage not found")) {
      return c.text("Not Found", 404)
    }
    return c.text(msg, 500)
  }
})
