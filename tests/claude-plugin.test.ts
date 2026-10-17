import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const PLUGIN = path.join(ROOT, "claude-plugin")
const GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe"
const BASH = process.platform === "win32" && existsSync(GIT_BASH) ? GIT_BASH : "bash"

const readJson = async <Value>(file: string): Promise<Value> =>
  JSON.parse(await fs.readFile(file, "utf-8")) as Value

const frontmatter = (markdown: string): Record<string, string> => {
  const match = markdown.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n/)
  assert.ok(match, "missing frontmatter")
  const fields: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":")
    if (key && rest.length) fields[key.trim()] = rest.join(":").trim()
  }
  return fields
}

const runBash = (script: string, args: string[], cwd: string, env: Record<string, string> = {}) =>
  spawnSync(BASH, [script, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN, ...env },
  })

const withWorkspace = async (run: (workspace: string) => Promise<void>): Promise<void> => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "echoes-claude-test-"))
  try {
    await run(workspace)
  } finally {
    await fs.rm(workspace, { recursive: true, force: true })
  }
}

test("Claude plugin bundles a byte-identical copy of the reference runtime", async () => {
  const reference = await fs.readFile(path.join(ROOT, "scripts", "echoes_vault.py"))
  const bundled = await fs.readFile(path.join(PLUGIN, "scripts", "echoes_vault.py"))
  assert.ok(reference.equals(bundled), "run `npm run sync:claude` to refresh the bundled runtime")
})

test("Claude plugin manifest and marketplace agree with the package version", async () => {
  const pkg = await readJson<{ version: string }>(path.join(ROOT, "package.json"))
  const manifest = await readJson<{ name: string; version: string }>(
    path.join(PLUGIN, ".claude-plugin", "plugin.json"),
  )
  const marketplace = await readJson<{
    plugins: Array<{ name: string; source: string; version?: string }>
  }>(path.join(ROOT, ".claude-plugin", "marketplace.json"))

  assert.equal(manifest.name, "echoes-vault")
  assert.equal(manifest.version, pkg.version)
  const entry = marketplace.plugins.find((plugin) => plugin.name === manifest.name)
  assert.ok(entry, "marketplace must list the plugin")
  assert.equal(entry.source, "./claude-plugin")
})

test("lifecycle commands can only be invoked explicitly by the user", async () => {
  for (const name of ["echoes-init", "echoes-start", "echoes-end"]) {
    const fields = frontmatter(await fs.readFile(path.join(PLUGIN, "commands", `${name}.md`), "utf-8"))
    assert.equal(fields["disable-model-invocation"], "true", `${name} must be user-only`)
    assert.ok(fields.description, `${name} needs a description`)
  }
  const status = frontmatter(
    await fs.readFile(path.join(PLUGIN, "commands", "echoes-status.md"), "utf-8"),
  )
  assert.ok(status.description)
})

test("launcher runs the bundled runtime as the claude agent", async () => {
  await withWorkspace(async (workspace) => {
    const launcher = path.join(PLUGIN, "bin", "echoes")
    const init = runBash(launcher, ["--workspace", workspace, "init"], workspace)
    assert.equal(init.status, 0, init.stderr)
    assert.ok(existsSync(path.join(workspace, "EchoesVault", ".echoes-vault.json")))

    const state = await readJson<{ lastWriter: { agent: string; adapterVersion: string } }>(
      path.join(workspace, ".echoes-vault", "state.json"),
    )
    const pkg = await readJson<{ version: string }>(path.join(ROOT, "package.json"))
    assert.equal(state.lastWriter.agent, "claude")
    assert.equal(state.lastWriter.adapterVersion, pkg.version)
  })
})

test("launcher skips a Python executable that cannot run", async () => {
  await withWorkspace(async (workspace) => {
    const launcher = path.join(PLUGIN, "bin", "echoes")
    const result = runBash(launcher, ["--workspace", workspace, "protocol"], workspace, {
      ECHOES_VAULT_PYTHON: "definitely-not-python",
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /definitely-not-python/)
  })
})

test("session-start hook is silent outside a vault and read-only inside one", async () => {
  await withWorkspace(async (workspace) => {
    const hook = path.join(PLUGIN, "hooks", "session-start")
    const quiet = runBash(hook, [], workspace, { CLAUDE_PROJECT_DIR: workspace })
    assert.equal(quiet.status, 0, quiet.stderr)
    assert.equal(quiet.stdout.trim(), "")
    assert.equal(existsSync(path.join(workspace, "EchoesVault")), false)

    const init = runBash(path.join(PLUGIN, "bin", "echoes"), ["--workspace", workspace, "init"], workspace)
    assert.equal(init.status, 0, init.stderr)

    const nudge = runBash(hook, [], workspace, { CLAUDE_PROJECT_DIR: workspace })
    assert.equal(nudge.status, 0, nudge.stderr)
    const output = JSON.parse(nudge.stdout) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string }
    }
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart")
    assert.match(output.hookSpecificOutput.additionalContext, /\/echoes-start/)
  })
})
