import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { randomUUID } from 'node:crypto'
import type { MirroredNotification } from '../src/types.js'

interface NotificationListenerOptions {
  dataDir: string
  onNotification: (notification: MirroredNotification) => void
}

export class NotificationListenerManager {
  private readonly dataDir: string
  private readonly historyPath: string
  private readonly onNotification: (notification: MirroredNotification) => void
  private process: ChildProcess | null = null
  private running = false
  private accessGranted = false
  private restartTimeout: NodeJS.Timeout | null = null
  private history: MirroredNotification[] = []
  private seenIds = new Set<string>()

  constructor(options: NotificationListenerOptions) {
    this.dataDir = options.dataDir
    this.historyPath = path.join(this.dataDir, 'notifications-history.json')
    this.onNotification = options.onNotification
    this.history = readArray<MirroredNotification>(this.historyPath).slice(0, 100)
    for (const item of this.history) {
      if (item.notificationId !== undefined) {
        this.seenIds.add(`${item.appName}::${item.notificationId}`)
      }
    }
  }

  start() {
    if (this.running || process.platform !== 'win32') return
    this.running = true
    this.spawnListener()
  }

  stop() {
    this.running = false
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout)
      this.restartTimeout = null
    }
    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // ignore
      }
      this.process = null
    }
  }

  getStatus() {
    return {
      running: this.running && Boolean(this.process && !this.process.killed),
      accessGranted: this.accessGranted,
      historyCount: this.history.length,
    }
  }

  getHistory(): MirroredNotification[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
    writeJson(this.historyPath, [])
  }

  sendTestNotification(title = 'Test Bildirimi', body = 'Bilgisayarınızdan telefonunuza başarıyla iletildi!'): MirroredNotification {
    const notif: MirroredNotification = {
      id: randomUUID(),
      appName: 'Omni Test',
      title,
      body,
      timestamp: Date.now(),
      source: 'test',
    }
    this.handleNewNotification(notif)
    return notif
  }

  async pushToNtfy(topic: string, notif: MirroredNotification, serverUrl = 'https://ntfy.sh'): Promise<boolean> {
    if (!topic || !topic.trim()) return false
    const cleanTopic = topic.trim().replace(/^\/+/, '')
    const baseUrl = (serverUrl || 'https://ntfy.sh').replace(/\/+$/, '')
    const target = `${baseUrl}/${cleanTopic}`

    try {
      await requestRaw(
        target,
        'POST',
        Buffer.from(notif.body || notif.title, 'utf8'),
        'text/plain',
        {
          'Title': `=?UTF-8?B?${Buffer.from(`[${notif.appName}] ${notif.title}`).toString('base64')}?=`,
          'Priority': 'default',
          'Tags': 'bell,desktop',
        }
      )
      return true
    } catch (e) {
      console.error('[notification] push to ntfy failed:', e)
      return false
    }
  }

  private handleNewNotification(notif: MirroredNotification) {
    this.history = [notif, ...this.history].slice(0, 100)
    writeJson(this.historyPath, this.history)
    try {
      this.onNotification(notif)
    } catch (e) {
      console.error('[notification] listener dispatch error:', e)
    }
  }

  private spawnListener() {
    if (!this.running) return

    const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime]
$null = [Windows.Foundation.IAsyncOperation\`1, Windows.Foundation, ContentType = WindowsRuntime]

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
}[0]

function Await-AsyncOp($asyncOp, $resultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
    $netTask = $asTask.Invoke($null, @($asyncOp))
    $netTask.Wait()
    return $netTask.Result
}

$listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
$accessOp = $listener.RequestAccessAsync()
$status = Await-AsyncOp $accessOp ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
$statusStr = "$status"

Write-Output "[STATUS] $statusStr"

if ($statusStr -ne "Allowed") {
    Write-Output "[ERROR] UserNotificationListener access denied: $statusStr"
    Start-Sleep -Seconds 10
    exit 1
}

$processedIds = New-Object 'System.Collections.Generic.HashSet[string]'

# Initial populate existing to avoid flooding past notifications
try {
    $initialOp = $listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)
    $initialNotifs = Await-AsyncOp $initialOp ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
    foreach ($item in $initialNotifs) {
        $key = "$($item.AppInfo.DisplayInfo.DisplayName)::$($item.Id)"
        $null = $processedIds.Add($key)
    }
    Write-Output "[READY] Seeded $($processedIds.Count) existing notifications."
} catch {
    Write-Output "[WARN] Could not seed existing notifications: $_"
}

while ($true) {
    Start-Sleep -Milliseconds 1500
    try {
        $getOp = $listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)
        $notifs = Await-AsyncOp $getOp ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
        foreach ($n in $notifs) {
            $app = $n.AppInfo.DisplayInfo.DisplayName
            $key = "$app::$($n.Id)"
            if (-not $processedIds.Contains($key)) {
                $null = $processedIds.Add($key)
                if ($processedIds.Count -gt 500) {
                    $processedIds.Clear()
                }

                $binding = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
                $title = ""
                $body = ""
                if ($binding) {
                    $texts = @($binding.GetTextElements() | ForEach-Object { $_.Text })
                    if ($texts.Count -ge 1) { $title = $texts[0] }
                    if ($texts.Count -ge 2) { $body = ($texts[1..($texts.Count - 1)]) -join " " }
                }

                if ([string]::IsNullOrWhiteSpace($title) -and [string]::IsNullOrWhiteSpace($body)) {
                    continue
                }

                $obj = [PSCustomObject]@{
                    notificationId = $n.Id
                    appName = $app
                    title = if ($title) { $title } else { $app }
                    body = if ($body) { $body } else { "" }
                    timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
                }
                $json = $obj | ConvertTo-Json -Compress
                Write-Output "[NOTIFICATION_JSON] $json"
            }
        }
    } catch {
        # continue loop on intermittent read errors
    }
}
`

    try {
      const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      this.process = child
      let buffer = ''

      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (trimmed.startsWith('[STATUS] Allowed')) {
            this.accessGranted = true
            console.info('[notification-listener] WinRT notification access allowed.')
          } else if (trimmed.startsWith('[NOTIFICATION_JSON]')) {
            try {
              const rawJson = trimmed.slice('[NOTIFICATION_JSON]'.length).trim()
              const parsed = JSON.parse(rawJson)
              const appName = typeof parsed.appName === 'string' ? parsed.appName : 'Windows'
              const notifId = parsed.notificationId
              const key = `${appName}::${notifId}`

              if (notifId !== undefined && this.seenIds.has(key)) {
                continue
              }
              if (notifId !== undefined) {
                this.seenIds.add(key)
                if (this.seenIds.size > 500) {
                  this.seenIds.clear()
                }
              }

              // Filter notifications generated by this app itself to avoid infinite feedback loop
              if (/^Omni/i.test(appName)) {
                continue
              }

              const notif: MirroredNotification = {
                id: randomUUID(),
                notificationId: notifId,
                appName,
                title: typeof parsed.title === 'string' && parsed.title ? parsed.title : appName,
                body: typeof parsed.body === 'string' ? parsed.body : '',
                timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
                source: 'windows',
              }

              this.handleNewNotification(notif)
            } catch (err) {
              console.error('[notification-listener] JSON parse error:', err)
            }
          }
        }
      })

      child.stderr.on('data', (chunk: Buffer) => {
        const err = chunk.toString('utf8').trim()
        if (err) {
          console.warn('[notification-listener] stderr:', err)
        }
      })

      child.on('exit', (code) => {
        this.process = null
        if (this.running) {
          console.info(`[notification-listener] exited with code ${code}. Restarting in 5s...`)
          this.restartTimeout = setTimeout(() => this.spawnListener(), 5000)
        }
      })

      child.on('error', (err) => {
        console.error('[notification-listener] spawn error:', err)
        this.process = null
        if (this.running) {
          this.restartTimeout = setTimeout(() => this.spawnListener(), 5000)
        }
      })
    } catch (e) {
      console.error('[notification-listener] failed to spawn listener:', e)
      if (this.running) {
        this.restartTimeout = setTimeout(() => this.spawnListener(), 5000)
      }
    }
  }
}

function readArray<T>(filePath: string): T[] {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    return Array.isArray(value) ? (value as T[]) : []
  } catch {
    return []
  }
}

function writeJson(filePath: string, value: unknown) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
  } catch {
    // best effort
  }
}

async function requestRaw(
  urlValue: string,
  method: string,
  body?: Buffer,
  contentType?: string,
  customHeaders?: Record<string, string>
): Promise<any> {
  const url = new URL(urlValue)
  const transport = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(body ? { 'Content-Length': String(body.length) } : {}),
      ...(customHeaders || {}),
    }

    const request = transport.request(
      url,
      {
        method,
        rejectUnauthorized: false,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          if ((response.statusCode || 500) >= 400) {
            reject(new Error(raw || `HTTP ${response.statusCode}`))
            return
          }
          try {
            resolve(raw ? JSON.parse(raw) : {})
          } catch {
            resolve(raw)
          }
        })
      }
    )
    request.setTimeout(10_000, () => request.destroy(new Error('İstek zaman aşımına uğradı.')))
    request.on('error', reject)
    if (body) request.write(body)
    request.end()
  })
}
