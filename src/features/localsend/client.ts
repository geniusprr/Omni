import { desktop } from '@/lib/desktop'
import type { LocalSendDevice, LocalSendStatus, ReceivedFileRecord } from '@/types'

export async function getLocalSendStatus(): Promise<LocalSendStatus> {
  return desktop.localsend.getStatus()
}

export async function getLocalSendDevices(): Promise<LocalSendDevice[]> {
  return desktop.localsend.getDevices()
}

export async function scanLocalSendNetwork(): Promise<void> {
  return desktop.localsend.scanNetwork()
}

export async function sendTextToDevice(targetIp: string, targetPort: number, text: string): Promise<string> {
  return desktop.localsend.sendText(targetIp, targetPort, text)
}

export async function sendFileToDevice(targetIp: string, targetPort: number, filePath: string): Promise<string> {
  return desktop.localsend.sendFile(targetIp, targetPort, filePath)
}

export async function getReceivedFiles(): Promise<ReceivedFileRecord[]> {
  return desktop.localsend.getReceivedFiles()
}

export async function openReceivedFolder(): Promise<void> {
  return desktop.localsend.openDownloadFolder()
}

export async function setAutoAccept(enabled: boolean): Promise<boolean> {
  return desktop.localsend.setAutoAccept(enabled)
}

export async function addManualDevice(targetIp: string, targetPort?: number): Promise<LocalSendDevice> {
  return desktop.localsend.addManualDevice(targetIp, targetPort)
}
