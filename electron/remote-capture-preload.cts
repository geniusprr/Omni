import { contextBridge, ipcRenderer } from 'electron'

type Listener = (payload: unknown) => void

function subscribe(channel: string, listener: Listener) {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('kapanisCapture', {
  onStart: (listener: Listener) => subscribe('remote-capture:start', listener),
  onSignal: (listener: Listener) => subscribe('remote-capture:signal', listener),
  sendSignal: (payload: unknown) => ipcRenderer.send('remote-capture:signal', payload),
  sendInput: (payload: unknown) => ipcRenderer.send('remote-capture:input', payload),
})
