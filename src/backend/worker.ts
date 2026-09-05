import app from "./index"

export default {
  // Cloudflare's module-worker runtime requires the fetch callback to return
  // a Promise on every request. Hono may return a Response synchronously for
  // some routes, so keep the platform boundary explicitly async.
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    return await app.fetch(request, env, ctx)
  },
}
