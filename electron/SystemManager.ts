import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AppSettings, TimerAction, TimerState } from '../src/types.js'

const execFileAsync = promisify(execFile)
const MAX_TIMER_SECONDS = 315_360_000

export class SystemManager {
  private readonly dataDir: string
  private readonly timerPath: string
  private readonly settingsPath: string
  private timer: TimerState | null

  constructor(dataDir: string) {
    this.dataDir = dataDir
    this.timerPath = path.join(dataDir, 'timer-state.json')
    this.settingsPath = path.join(dataDir, 'settings.json')
    fs.mkdirSync(dataDir, { recursive: true })
    this.timer = this.readTimer()
  }

  getTimerStatus() {
    if (this.timer && this.timer.targetAt <= Date.now()) {
      this.timer = null
      this.persistTimer()
    }
    return this.timer ? { ...this.timer } : null
  }

  async scheduleShutdown(action: TimerAction, seconds: number) {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_TIMER_SECONDS) {
      throw new Error('Zamanlayıcı 1 saniye ile 10 yıl arasında olmalı.')
    }
    if (action !== 'shutdown' && action !== 'restart') throw new Error('Geçersiz Windows işlemi seçildi.')
    if (this.timer) await this.cancelShutdown()
    await this.runWindowsCommand([action === 'shutdown' ? '/s' : '/r', '/t', String(seconds)])
    this.timer = { action, targetAt: Date.now() + seconds * 1_000, durationSeconds: seconds }
    this.persistTimer()
    return { ...this.timer }
  }

  async cancelShutdown() {
    const hadTimer = Boolean(this.timer)
    const commandError = await this.runWindowsCommand(['/a']).catch((error) => error as Error)
    this.timer = null
    this.persistTimer()
    if (hadTimer && commandError instanceof Error) throw commandError
  }

  restoreTimer() {
    const timer = this.getTimerStatus()
    if (!timer) return
    const remaining = Math.max(1, Math.ceil((timer.targetAt - Date.now()) / 1_000))
    void this.runWindowsCommand(['/a'])
      .then(() => this.runWindowsCommand([timer.action === 'shutdown' ? '/s' : '/r', '/t', String(remaining)]))
      .catch((error) => console.error('[system] timer restore failed', error))
  }

  async getInfo() {
    return { hostname: os.hostname() || 'Windows PC', os: process.platform === 'win32' ? 'Windows' : os.platform(), platform: process.platform }
  }

  getSettings(): AppSettings | null {
    try {
      const raw = fs.readFileSync(this.settingsPath, 'utf8')
      return JSON.parse(raw) as AppSettings
    } catch {
      return null
    }
  }

  saveSettings(settings: AppSettings) {
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8')
  }

  getAutostart() {
    try { return app.getLoginItemSettings({ args: ['--background'] }).openAtLogin } catch { return false }
  }

  setAutostart(enabled: boolean) {
    app.setLoginItemSettings({ openAtLogin: enabled, args: ['--background'], openAsHidden: true })
    return this.getAutostart()
  }

  async openExternal(url: string) {
    // Kept as an explicit service boundary so all external actions pass through
    // the same validation in WindowManager's IPC handler.
    return url
  }

  private async runWindowsCommand(args: string[]) {
    if (process.platform !== 'win32') throw new Error('Windows sistem komutu yalnızca Windows üzerinde kullanılabilir.')
    try {
      await execFileAsync('shutdown.exe', args, { windowsHide: true, timeout: 10_000 })
    } catch (error) {
      const typed = error as { stderr?: string; stdout?: string; message?: string }
      throw new Error((typed.stderr || typed.stdout || typed.message || 'Windows komutu başarısız oldu.').trim())
    }
  }

  private readTimer() {
    try {
      const value = JSON.parse(fs.readFileSync(this.timerPath, 'utf8')) as Partial<TimerState>
      if ((value.action === 'shutdown' || value.action === 'restart') && typeof value.targetAt === 'number' && typeof value.durationSeconds === 'number' && value.targetAt > Date.now()) {
        return { action: value.action, targetAt: value.targetAt, durationSeconds: value.durationSeconds }
      }
    } catch { /* no timer persisted */ }
    try { fs.rmSync(this.timerPath, { force: true }) } catch { /* best effort */ }
    return null
  }

  private persistTimer() {
    try {
      if (this.timer) fs.writeFileSync(this.timerPath, JSON.stringify(this.timer, null, 2), 'utf8')
      else fs.rmSync(this.timerPath, { force: true })
    } catch (error) { console.error('[system] timer state could not be persisted', error) }
  }
}

