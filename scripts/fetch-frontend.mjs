/**
 * 从官方前端 OpenList-Frontend 获取构建产物 (dist/)。
 *
 * OpenListNext(TSWorker) 后端不再维护内嵌前端源码，前端统一由官方仓库
 * OpenList-Frontend 提供（通过 backend 字段在运行时探测 GO/TS 模式）。
 *
 * 产物来源优先级（高 -> 低）：
 *   1. FRONTEND_DIST 环境变量：已构建好的 dist 目录路径（最快，CI 缓存场景）
 *   2. FRONTEND_REPO 环境变量：本地官方前端仓库路径（自动 install + build）
 *   3. 同级目录 ../OpenList-Frontend（monorepo 布局，自动探测，自动 install + build）
 *   4. 默认：从 Git 克隆官方仓库并构建
 *
 * 用法：
 *   FRONTEND_DIST=/path/to/dist node scripts/fetch-frontend.mjs
 *   FRONTEND_REPO=../OpenList-Frontend node scripts/fetch-frontend.mjs
 *   node scripts/fetch-frontend.mjs
 */

import { execFileSync, execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 始终以仓库根目录为基准（无论从哪个 cwd 调用）
const ROOT = path.resolve(__dirname, "..")
const DEST = path.join(ROOT, "dist")

const OFFICIAL_REPO_URL =
  process.env.FRONTEND_GIT_URL ||
  "https://github.com/OpenListTeam/OpenList-Frontend.git"
const OFFICIAL_REPO_REF = process.env.FRONTEND_GIT_REF || "main"

function run(cmd, opts = {}) {
  console.log(`  > ${cmd}`)
  execSync(cmd, { stdio: "inherit", shell: true, ...opts })
}

function detectPackageManager(dir) {
  const packageFile = path.join(dir, "package.json")
  const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"))
  const declared = String(packageJson.packageManager || "")
  const pnpmMatch = declared.match(/^pnpm@(\d+\.\d+\.\d+)$/)

  if (pnpmMatch) {
    const executable = `npx --yes pnpm@${pnpmMatch[1]}`
    return {
      install: `${executable} install --frozen-lockfile`,
      retryInstall: `${executable} install --frozen-lockfile --trust-lockfile`,
      run: (script) => `${executable} run ${script}`,
    }
  }

  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) {
    return {
      install: "pnpm install --frozen-lockfile",
      retryInstall: "pnpm install --frozen-lockfile --trust-lockfile",
      run: (script) => `pnpm run ${script}`,
    }
  }

  return {
    install: "npm install",
    run: (script) => `npm run ${script}`,
  }
}

/**
 * 目标仓库锁定了独立的 pnpm 版本（packageManager 字段，如前端仓库 pnpm@11.24.0），
 * 用 npx 按精确版本执行。
 *
 * 不走 corepack：旧版 Node（如 EdgeOne 构建环境的 22.11.0）自带的 corepack
 * 内置 npm 签名密钥已过期（2025-04 registry 密钥轮换），`corepack pnpm` 会报
 * "Cannot find matching keyid" 直接失败；npx 只经 npm 下载，无此问题。
 */
function installDependencies(pm, cwd) {
  try {
    run(pm.install, { cwd })
  } catch (error) {
    if (!pm.retryInstall) throw error
    // 重试一次并加 --trust-lockfile：pnpm 11 默认对 lockfile 逐项重跑
    // minimumReleaseAge / trustPolicy 供应链复核，registry manifest 缺少
    // 平台子包时会误报（如 @crowdin/cli-*-arm64）。lockfile 来自刚克隆的
    // 官方前端仓库（HTTPS + 官方分支），属于可信来源，跳过复核安全。
    console.warn(
      "  [fetch-frontend] pnpm install 失败（lockfile 供应链复核或网络问题），--trust-lockfile 重试一次...",
    )
    run(pm.retryInstall, { cwd })
  }
}

function requireDist(src) {
  if (!fs.existsSync(path.join(src, "index.html"))) {
    throw new Error(`前端产物目录缺少 index.html: ${src}`)
  }
}

function hasTranslatedLocales(repo) {
  const langDir = path.join(repo, "src", "lang")
  if (!fs.existsSync(langDir)) return false
  return fs.readdirSync(langDir, { withFileTypes: true }).some((entry) => {
    return (
      entry.isDirectory() &&
      entry.name.toLowerCase() !== "en" &&
      fs.existsSync(path.join(langDir, entry.name, "index.json"))
    )
  })
}

/**
 * The official frontend main branch keeps only the English source dictionary.
 * Published builds ship the translated dictionaries separately as i18n.tar.gz.
 * Fetch that archive before Vite builds so the language switcher includes zh-CN.
 */
function prepareI18n(repo) {
  if (hasTranslatedLocales(repo)) {
    console.log("  检测到前端已有翻译语言包")
    run("node ./scripts/i18n.mjs", { cwd: repo })
    return
  }

  const packageFile = path.join(repo, "package.json")
  const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"))
  const version = String(packageJson.version || "").trim()
  const versionSegment = encodeURIComponent(version)
  const urls = [
    `https://github.com/OpenListTeam/OpenList-Frontend/releases/download/v${versionSegment}/i18n.tar.gz`,
    "https://github.com/OpenListTeam/OpenList-Frontend/releases/latest/download/i18n.tar.gz",
  ]
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), "openlist-i18n-"))
  const archive = path.join(archiveDir, "i18n.tar.gz")

  try {
    const downloaded = urls.some((url) => {
      try {
        execFileSync(
          "curl",
          [
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--retry",
            "3",
            "--connect-timeout",
            "10",
            "--max-time",
            "120",
            "--output",
            archive,
            url,
          ],
          { stdio: "ignore" },
        )
        return true
      } catch {
        return false
      }
    })

    if (!downloaded) {
      throw new Error(
        `无法获取官方前端翻译包（版本 ${version || "unknown"}）。为避免重新部署成纯英文，已停止构建。`,
      )
    }

    const langDir = path.join(repo, "src", "lang")
    fs.mkdirSync(langDir, { recursive: true })
    execFileSync("tar", ["-xzf", archive, "-C", langDir], { stdio: "ignore" })
    run("node ./scripts/i18n.mjs", { cwd: repo })
    console.log("✓ 官方翻译语言包已就绪")
  } finally {
    fs.rmSync(archiveDir, { recursive: true, force: true })
  }
}

function replaceDist(src) {
  console.log(`  复制前端产物: ${src} -> ${DEST}`)
  fs.rmSync(DEST, { recursive: true, force: true })
  fs.cpSync(src, DEST, { recursive: true })
  console.log(`✓ 前端产物已就绪 (${DEST})`)
}

/** 在本地前端仓库中 install + build，并取 dist 产物 */
function buildLocalRepo(repo) {
  const abs = path.resolve(repo)
  if (!fs.existsSync(path.join(abs, "package.json"))) {
    throw new Error(`目录不是前端仓库: ${abs}`)
  }
  const pm = detectPackageManager(abs)
  installDependencies(pm, abs)
  prepareI18n(abs)
  run(pm.run("build"), { cwd: abs })
  replaceDist(path.join(abs, "dist"))
}

function main() {
  console.log("[fetch-frontend] 获取官方前端构建产物...")

  // 1. 本地已构建产物目录（显式指定）
  const localDist = process.env.FRONTEND_DIST
  if (localDist) {
    const src = path.resolve(localDist)
    requireDist(src)
    replaceDist(src)
    return
  }

  // 2. 本地前端仓库目录（显式指定）
  const localRepo = process.env.FRONTEND_REPO
  if (localRepo) {
    buildLocalRepo(localRepo)
    return
  }

  // 3. 同级目录 ../OpenList-Frontend（monorepo 布局，自动探测）
  const siblingRepo = path.resolve(ROOT, "..", "OpenList-Frontend")
  if (fs.existsSync(path.join(siblingRepo, "package.json"))) {
    console.log(`  检测到同级官方前端仓库: ${siblingRepo}`)
    buildLocalRepo(siblingRepo)
    return
  }

  // 4. 从 Git 克隆并构建（默认兜底）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openlist-frontend-"))
  console.log(`  克隆官方前端: ${OFFICIAL_REPO_URL}#${OFFICIAL_REPO_REF}`)
  try {
    run(
      // -c core.autocrlf=false：禁用克隆端的换行符转换。Windows 上 autocrlf
      // 会把前端源码（含 index.html）检出为 CRLF，改变 vite 构建出的
      // dist/index.html 内容，进而导致产物哈希跨平台不一致。
      `git -c core.autocrlf=false clone --depth 1 --branch ${OFFICIAL_REPO_REF} ${OFFICIAL_REPO_URL} ${tmp}`,
    )
    buildLocalRepo(tmp)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

try {
  main()
} catch (err) {
  console.error("[fetch-frontend] 失败:", err?.message || err)
  process.exit(1)
}
