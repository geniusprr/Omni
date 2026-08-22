import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TrustedDeviceStore } from './TrustedDeviceStore.js'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kapanis-remote-test-'))
}

const directory = tempDir()
try {
  const store = new TrustedDeviceStore(directory)
  const issued = store.issueToken('phone-1', 'Test Telefon')
  assert.equal(store.list().length, 1)
  assert.equal(store.authorize(issued.token)?.controllerId, 'phone-1')
  assert.equal(store.authorize('not-a-token'), null)
  assert.equal(store.revoke(issued.device.id), true)
  assert.equal(store.authorize(issued.token), null)

  const legacyDirectory = tempDir()
  try {
    fs.writeFileSync(path.join(legacyDirectory, 'local-auth-tokens.json'), JSON.stringify(['legacy-secret']), 'utf8')
    const migrated = new TrustedDeviceStore(legacyDirectory)
    assert.equal(migrated.list().length, 1)
    assert.equal(migrated.authorize('legacy-secret')?.controllerName, 'Önceki eşleşmiş cihaz')
    const persisted = JSON.parse(fs.readFileSync(path.join(legacyDirectory, 'local-auth-tokens.json'), 'utf8')) as { version: number; devices: Array<{ tokenHash: string }> }
    assert.equal(persisted.version, 2)
    assert.equal(persisted.devices[0].tokenHash.length, 64)
  } finally {
    fs.rmSync(legacyDirectory, { recursive: true, force: true })
  }
  console.log('trusted device token migration and revocation tests passed')
} finally {
  fs.rmSync(directory, { recursive: true, force: true })
}
