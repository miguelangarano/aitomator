import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs"
import { homedir, platform } from "node:os"
import { dirname, join } from "node:path"

export function servicePath(): string { return platform() === "darwin" ? join(homedir(), "Library", "LaunchAgents", "dev.aitomator.plist") : join(homedir(), ".config", "systemd", "user", "aitomator.service") }
export function installService(workspace: string): string {
  const path = servicePath(); mkdirSync(dirname(path), { recursive: true }); const cli = join(import.meta.dir, "index.ts")
  const content = platform() === "darwin" ? `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>dev.aitomator</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${cli}</string><string>start</string></array><key>WorkingDirectory</key><string>${workspace}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>\n` : `[Unit]\nDescription=AItomator workflow daemon\nAfter=network-online.target\n\n[Service]\nType=simple\nExecStart=${process.execPath} ${cli} start\nWorkingDirectory=${workspace}\nEnvironmentFile=-${join(workspace, ".env")}\nRestart=always\nRestartSec=3\n\n[Install]\nWantedBy=default.target\n`
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
