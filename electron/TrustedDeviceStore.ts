import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { RemoteTrustedDevice } from '../src/types.js'

interface StoredTrustedDevice extends RemoteTrustedDevice {
  tokenHash: string
}

interface StoredFile {
  version: 2
  devices: StoredTrustedDevice[]
}

function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function makeToken() {
  return 'loc_' + randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
}

export class TrustedDeviceStore {
  private readonly filePath: string
  private devices: StoredTrustedDevice[]

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'local-auth-tokens.json')
    this.devices = this.read()
    this.persist()
  }

  issueToken(controllerId: string, controllerName: string) {
    const now = Date.now()
    const id = randomUUID()
    const token = makeToken()
    const cleanControllerId = controllerId.trim() || `legacy-${id}`
    this.devices = this.devices.filter((device) => device.controllerId !== cleanControllerId)
    this.devices.push({
      id,
      controllerId: cleanControllerId,
      controllerName: controllerName.trim() || 'Mobil cihaz',
      tokenHash: hashToken(token),
      createdAt: now,
      lastActiveAt: now,
    })
    this.persist()
    return { token, device: this.publicDevice(this.devices[this.devices.length - 1]) }
  }

  authorize(token: string) {
    const clean = token.trim()
    if (!clean) return null
    const device = this.devices.find((item) => item.tokenHash === hashToken(clean))
    if (!device) return null
    device.lastActiveAt = Date.now()
    this.persist()
    return this.publicDevice(device)
  }

  list(): RemoteTrustedDevice[] {
    return this.devices
      .map((device) => this.publicDevice(device))
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  }

  revoke(id: string) {
    const before = this.devices.length
    this.devices = this.devices.filter((device) => device.id !== id)
    if (this.devices.length !== before) this.persist()
    return this.devices.length !== before
  }

  revokeAll() {
    const count = this.devices.length
    this.devices = []
    if (count) this.persist()
    return count
  }

  private publicDevice(device: StoredTrustedDevice): RemoteTrustedDevice {
    return {
      id: device.id,
      controllerId: device.controllerId,
      controllerName: device.controllerName,
      createdAt: device.createdAt,
      lastActiveAt: device.lastActiveAt,
    }
  }

  private read(): StoredTrustedDevice[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown
      if (Array.isArray(raw)) {
        // Migrate the old raw-token array without ever logging or returning its values.
        return raw
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((token, index) => {
            const now = Date.now()
            return {
              id: `legacy-${index}-${hashToken(token).slice(0, 12)}`,
              controllerId: `legacy-${index}`,
              controllerName: 'Önceki eşleşmiş cihaz',
              tokenHash: hashToken(token),
              createdAt: now,
              lastActiveAt: now,
            }
          })
      }
      if (!raw || typeof raw !== 'object') return []
      const value = raw as Partial<StoredFile>
      if (value.version !== 2 || !Array.isArray(value.devices)) return []
      return value.devices.filter((device): device is StoredTrustedDevice => Boolean(
        device &&
        typeof device.id === 'string' &&
        typeof device.controllerId === 'string' &&
        typeof device.controllerName === 'string' &&
        typeof device.tokenHash === 'string' &&
        typeof device.createdAt === 'number' &&
        typeof device.lastActiveAt === 'number',
      ))
    } catch {
      return []
    }
  }

  private persist() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify({ version: 2, devices: this.devices }, null, 2), 'utf8')
    } catch {
      // Authentication still works for the current process if persistence is unavailable.
    }
  }
}
