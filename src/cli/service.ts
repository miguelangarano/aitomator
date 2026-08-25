import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs"
import { homedir, platform, userInfo } from "node:os"
import { dirname, join } from "node:path"

export function servicePath(): string { return platform() === "darwin" ? join(homedir(), "Library", "LaunchAgents", "dev.aitomator.plist") : join(homedir(), ".config", "systemd", "user", "aitomator.service") }
export function installService(workspace: string): string {
  const path = servicePath(); mkdirSync(dirname(path), { recursive: true }); const cli = join(import.meta.dir, "index.ts")
  mkdirSync(join(workspace, ".aitomator"), { recursive: true })
  const daemonLog = join(workspace, ".aitomator", "daemon.log")
  const content = platform() === "darwin" ? `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>dev.aitomator</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${cli}</string><string>start</string></array><key>WorkingDirectory</key><string>${workspace}</string><key>StandardOutPath</key><string>${daemonLog}</string><key>StandardErrorPath</key><string>${daemonLog}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>\n` : `[Unit]\nDescription=AItomator workflow daemon\nAfter=network-online.target\n\n[Service]\nType=simple\nExecStart=${process.execPath} ${cli} start\nWorkingDirectory=${workspace}\nEnvironmentFile=-${join(workspace, ".env")}\nRestart=always\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n`
  writeFileSync(path, content); return path
}
export function uninstallService(): boolean { const path = servicePath(); if (!existsSync(path)) return false; unlinkSync(path); return true }

export function activateService(path: string): { active: boolean; message?: string } {
  const command = platform() === "darwin" ? ["launchctl", "load", path] : ["systemctl", "--user", "enable", "--now", "aitomator.service"]
  if (platform() !== "darwin") Bun.spawnSync(["systemctl", "--user", "daemon-reload"], { stdout: "ignore", stderr: "ignore" })
  const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" })
  return { active: result.exitCode === 0, message: result.exitCode === 0 ? undefined : result.stderr.toString().trim() }
}

export function deactivateService(path: string): void {
  if (platform() === "darwin") Bun.spawnSync(["launchctl", "unload", path], { stdout: "ignore", stderr: "ignore" })
  else { Bun.spawnSync(["systemctl", "--user", "disable", "--now", "aitomator.service"], { stdout: "ignore", stderr: "ignore" }); Bun.spawnSync(["systemctl", "--user", "daemon-reload"], { stdout: "ignore", stderr: "ignore" }) }
}

export function isServiceInstalled(): boolean { return existsSync(servicePath()) }
export function isServiceActive(): boolean {
  const command = platform() === "darwin" ? ["launchctl", "print", `gui/${process.getuid?.() ?? userInfo().uid}/dev.aitomator`] : ["systemctl", "--user", "is-active", "--quiet", "aitomator.service"]
  return Bun.spawnSync(command, { stdout: "ignore", stderr: "ignore" }).exitCode === 0
}

export function controlService(action: "start" | "stop" | "restart" | "status"): { ok: boolean; output: string } {
  const uid = process.getuid?.() ?? userInfo().uid
  if (platform() === "darwin" && action === "restart") {
    Bun.spawnSync(["launchctl", "unload", servicePath()], { stdout: "ignore", stderr: "ignore" })
    const result = Bun.spawnSync(["launchctl", "load", servicePath()], { stdout: "pipe", stderr: "pipe" })
    return { ok: result.exitCode === 0, output: `${result.stdout.toString()}${result.stderr.toString()}`.trim() }
  }
  const command = platform() === "darwin"
    ? action === "status" ? ["launchctl", "print", `gui/${uid}/dev.aitomator`]
      : ["launchctl", action === "stop" ? "unload" : "load", servicePath()]
    : ["systemctl", "--user", action === "status" ? "status" : action, "aitomator.service", ...(action === "status" ? ["--no-pager"] : [])]
  const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" })
  const output = `${result.stdout.toString()}${result.stderr.toString()}`.trim()
  return { ok: result.exitCode === 0, output }
}

export function enableUserLinger(): { enabled: boolean; message?: string } {
  if (platform() === "darwin") return { enabled: true }
  const result = Bun.spawnSync(["loginctl", "enable-linger", userInfo().username], { stdout: "pipe", stderr: "pipe" })
  return { enabled: result.exitCode === 0, message: result.exitCode === 0 ? undefined : result.stderr.toString().trim() }
}

export async function showServiceLogs(workspace: string, follow = false, lines = 100): Promise<number> {
  const command = platform() === "darwin"
    ? ["tail", "-n", String(lines), ...(follow ? ["-f"] : []), join(workspace, ".aitomator", "daemon.log")]
    : ["journalctl", "--user", "-u", "aitomator.service", "-n", String(lines), "--no-pager", ...(follow ? ["-f"] : [])]
  const child = Bun.spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  return child.exited
}
