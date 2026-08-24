import { app, dialog, type BrowserWindow } from 'electron'
import electronUpdater, { type UpdateInfo } from 'electron-updater'
import type { AppUpdateStatus } from '../shared/contracts.js'

const { autoUpdater } = electronUpdater

type UpdateManagerOptions = {
  getMainWindow: () => BrowserWindow | null
  reportStatus: (status: AppUpdateStatus) => void
  beforeInstall: () => void
}

export class UpdateManager {
  private readonly options: UpdateManagerOptions
  private pendingInfo: UpdateInfo | null = null
  private promptedVersion: string | null = null
  private downloadedVersion: string | null = null
  private downloadStarted = false

  constructor(options: UpdateManagerOptions) {
    this.options = options
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = console

    autoUpdater.on('checking-for-update', () => {
      this.report({
        phase: 'checking',
        message: 'Yeni sürüm denetleniyor',
        currentVersion: app.getVersion(),
      })
    })

    autoUpdater.on('update-available', (info) => {
      this.pendingInfo = info
      this.report({
        phase: 'available',
        message: `Eon ${info.version} bulundu`,
        currentVersion: app.getVersion(),
        availableVersion: info.version,
      })
      const window = this.options.getMainWindow()
      if (window?.isVisible()) void this.promptForAvailableUpdate()
    })

    autoUpdater.on('update-not-available', () => {
      this.report({
        phase: 'current',
        message: 'Eon güncel',
        currentVersion: app.getVersion(),
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.report({
        phase: 'downloading',
        message: `Güncelleme indiriliyor · %${Math.round(progress.percent)}`,
        currentVersion: app.getVersion(),
        availableVersion: this.pendingInfo?.version,
        progress: Math.max(0, Math.min(100, progress.percent)),
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.downloadedVersion = info.version
      this.report({
        phase: 'downloaded',
        message: 'Güncelleme yeniden başlatmaya hazır',
        currentVersion: app.getVersion(),
        availableVersion: info.version,
        progress: 100,
      })
      void this.promptForRestart(info.version)
    })

    autoUpdater.on('error', (error) => {
      console.error('[updater] update error', error)
      this.report({
        phase: 'error',
        message: 'Güncelleme denetimi atlandı',
        currentVersion: app.getVersion(),
      })
    })
  }

  async checkOnLaunch() {
    if (!app.isPackaged || process.env.KAPANIS_SMOKE_TEST === '1') {
      this.report({
        phase: 'current',
        message: app.isPackaged ? 'Test oturumu hazır' : 'Geliştirme oturumu hazır',
        currentVersion: app.getVersion(),
      })
      return
    }

    this.report({
      phase: 'checking',
      message: 'GitHub Releases denetleniyor',
      currentVersion: app.getVersion(),
    })

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      console.error('[updater] initial check failed', error)
      this.report({
        phase: 'error',
        message: 'Çevrimdışı devam ediliyor',
        currentVersion: app.getVersion(),
      })
    }
  }

  async promptForAvailableUpdate() {
    const info = this.pendingInfo
    if (!info || this.promptedVersion === info.version || this.downloadStarted || this.downloadedVersion === info.version) return

    const window = this.options.getMainWindow()
    if (!window || window.isDestroyed() || !window.isVisible()) return
    this.promptedVersion = info.version

    const response = await dialog.showMessageBox(window, {
      type: 'info',
      title: 'Eon güncellemesi',
      message: `Eon ${info.version} kullanıma hazır.`,
      detail: `Şu an ${app.getVersion()} sürümünü kullanıyorsunuz. Yeni sürümü şimdi indirmek ister misiniz? İndirme tamamlandığında kurulum için yeniden başlatma izniniz ayrıca istenecek.`,
      buttons: ['İndir ve güncelle', 'Şimdi değil'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })

    if (response.response !== 0) return
    this.downloadStarted = true
    this.report({
      phase: 'downloading',
      message: 'Güncelleme indiriliyor',
      currentVersion: app.getVersion(),
      availableVersion: info.version,
      progress: 0,
    })

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.downloadStarted = false
      console.error('[updater] download failed', error)
      await dialog.showMessageBox(window, {
        type: 'error',
        title: 'Güncelleme indirilemedi',
        message: 'Eon güncellemesi indirilemedi.',
        detail: 'İnternet bağlantınızı kontrol edip uygulamayı yeniden açtığınızda güncelleme tekrar denetlenecek.',
        buttons: ['Tamam'],
        defaultId: 0,
        noLink: true,
      })
    }
  }

  private async promptForRestart(version: string) {
    const window = this.options.getMainWindow()
    if (!window || window.isDestroyed()) return

    const response = await dialog.showMessageBox(window, {
      type: 'info',
      title: 'Güncelleme hazır',
      message: `Eon ${version} indirildi.`,
      detail: 'Güncellemeyi kurmak için Eon yeniden başlatılmalı. Açık çalışmalarınızı kaydedin; yeniden başlatma sonrasında yeni sürüm otomatik olarak açılacak.',
      buttons: ['Yeniden başlat ve güncelle', 'Daha sonra'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })

    if (response.response !== 0) return
    this.options.beforeInstall()
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }

  private report(status: AppUpdateStatus) {
    this.options.reportStatus(status)
  }
}
