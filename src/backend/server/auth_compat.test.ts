import assert from "node:assert/strict"
import { test } from "node:test"
import { Hono } from "hono"
import { saveDb } from "../internal/model/db"
import { authRouter, hashPassword } from "./auth"

const app = new Hono()
app.route("/api/auth", authRouter)

const makeUser = async (overrides: Record<string, any> = {}) => ({
  id: 1,
  username: "admin",
  password: await hashPassword("correct-password"),
  role: 2,
  permission: 0,
  base_path: "/",
  disabled: false,
  ...overrides,
})

const seed = async (users: any[]) => {
  const env: any = {
    JWT_SECRET: "auth-compatibility-test-secret",
  }
  await saveDb({ settings: [], users, storages: [], shares: [] }, env)
  return env
}

const login = (env: any, body: Record<string, any>, ip: string) =>
  app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": ip,
      },
      body: JSON.stringify(body),
    },
    env,
  )

test("Compatibility: login requires a username with HTTP 400", async () => {
  const env = await seed([await makeUser()])
  const res = await login(
    env,
    { password: "correct-password" },
    "198.51.100.10",
  )
  const json: any = await res.json()

  assert.equal(res.status, 400)
  assert.equal(json.code, 400)
})

test("Compatibility: failed login attempts are counted per IP across usernames", async () => {
  const env = await seed([await makeUser()])
  const ip = "198.51.100.11"

  for (let i = 0; i < 5; i++) {
    const res = await login(
      env,
      { username: `missing-${i}`, password: "wrong-password" },
      ip,
    )
    assert.equal(res.status, 401)
  }

  const locked = await login(
    env,
    { username: "another-missing-user", password: "wrong-password" },
    ip,
  )
  assert.equal(locked.status, 429)
})

test("Compatibility: login/hash accepts the frontend static password hash", async () => {
  const env = await seed([await makeUser()])
  const res = await app.request(
    "/api/auth/login/hash",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "198.51.100.15",
      },
      body: JSON.stringify({
        username: "admin",
        password: await hashPassword("correct-password"),
      }),
    },
    env,
  )

  assert.equal(res.status, 200)
  assert.equal((await res.json()).code, 200)
})

test("Compatibility: missing 2FA code returns business code 402 and HTTP 402", async () => {
  const env = await seed([await makeUser({ otp_secret: "JBSWY3DPEHPK3PXP" })])
  const res = await login(
    env,
    { username: "admin", password: "correct-password" },
    "198.51.100.12",
  )
  const json: any = await res.json()

  assert.equal(res.status, 402)
  assert.equal(json.code, 402)
})

test("Compatibility: invalid 2FA code returns business code 402 and HTTP 402", async () => {
  const env = await seed([await makeUser({ otp_secret: "JBSWY3DPEHPK3PXP" })])
  const res = await login(
    env,
    {
      username: "admin",
      password: "correct-password",
      otp_code: "000000",
    },
    "198.51.100.13",
  )
  const json: any = await res.json()

  assert.equal(res.status, 402)
  assert.equal(json.code, 402)
})

test("Compatibility: password login tokens expire after the official 48-hour period", async () => {
  const env = await seed([await makeUser()])
  const res = await login(
    env,
    { username: "admin", password: "correct-password" },
    "198.51.100.14",
  )
  const json: any = await res.json()
  assert.equal(res.status, 200)

  const payload = JSON.parse(
    Buffer.from(json.data.token.split(".")[1], "base64url").toString("utf8"),
  )
  const remaining = payload.exp - Math.floor(Date.now() / 1000)
  assert.ok(remaining <= 48 * 60 * 60)
  assert.ok(remaining >= 48 * 60 * 60 - 5)
})
