;(function (OpenListPlugin, plugin) {
  "use strict"

  const ACTION_ID = "oplist-115-open-driver-repair"
  const REPAIR_ENDPOINT = "/api/admin/driver/115open/repair"
  const root = typeof globalThis === "undefined" ? {} : globalThis
  const sdk = OpenListPlugin || root.OpenListPlugin || null
  const currentPlugin = plugin || {
    name: "115 开放平台驱动修复",
  }

  function notify(level, message) {
    const api = sdk && sdk.notify
    if (api && typeof api[level] === "function") {
      api[level](message)
      return
    }
    console[level === "error" ? "error" : "log"](
      `[${currentPlugin.name}] ${message}`,
    )
  }

  function getAuthToken() {
    try {
      const storage = root.localStorage
      return storage?.getItem("token") || storage?.getItem("access_token") || ""
    } catch {
      return ""
    }
  }

  function authHeaders() {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    }
    const token = getAuthToken()
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  async function repair() {
    try {
      const response = await fetch(REPAIR_ENDPOINT, {
        method: "POST",
        headers: authHeaders(),
        credentials: "same-origin",
        body: "{}",
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || body.code !== 200) {
        throw new Error(body.message || `HTTP ${response.status}`)
      }

      const data = body.data || {}
      notify(
        "success",
        data.repaired
          ? `已修复 ${data.repaired} 个 115 开放平台存储，请重新打开目录。`
          : body.message || "没有需要修复的 115 开放平台存储。",
      )
      if (sdk && sdk.bus && root.location) {
        sdk.bus.emit("to", root.location.pathname)
      }
    } catch (error) {
      notify("error", `115 开放平台修复失败：${error?.message || error}`)
    }
  }

  function registerFallbackButton() {
    const document = root.document
    if (!document || !getAuthToken()) return

    const addButton = () => {
      if (!document.body || document.getElementById(ACTION_ID)) return
      const button = document.createElement("button")
      button.id = ACTION_ID
      button.type = "button"
      button.textContent = "修复 115 Open"
      button.title = "规范化 115 开放平台存储并刷新驱动缓存"
      Object.assign(button.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        padding: "8px 12px",
        border: "0",
        borderRadius: "6px",
        color: "#fff",
        background: "#1677ff",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0, 0, 0, .2)",
      })
      button.addEventListener("click", async () => {
        button.disabled = true
        try {
          await repair()
        } finally {
          button.disabled = false
        }
      })
      document.body.appendChild(button)
    }

    if (document.body) addButton()
    else
      document.addEventListener("DOMContentLoaded", addButton, { once: true })
  }

  if (sdk && typeof sdk.registerHeaderAction === "function") {
    sdk.registerHeaderAction({
      id: ACTION_ID,
      label: "修复 115 Open",
      icon: "🛠️",
      permission: "storage:manage",
      onClick: repair,
    })
  } else {
    console.warn(
      `[${currentPlugin.name}] OpenListPlugin SDK 不可用，使用备用修复按钮。`,
    )
    registerFallbackButton()
  }
})(
  typeof OpenListPlugin === "undefined" ? null : OpenListPlugin,
  typeof plugin === "undefined" ? null : plugin,
)
