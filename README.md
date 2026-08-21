# kapanış.

Windows için küçük, yerel ve düşük kaynak tüketimli bir kapatma sayacı + alarm uygulaması. Electron, React ve Chromium tabanlı gerçek bir tarayıcı sekme sistemi ile çalışır.

## Özellikler

- Bilgisayarı kapatma veya yeniden başlatma sayacı
- Aktif Windows planını tek tuşla iptal etme
- Tek seferlik, belirli aralıklarla veya ileri bir saatte başlayan alarmlar
- İptale kadar ya da 3/5/10 kez tekrarlama
- Üç Windows sistem sesi profili ve 5 dakika erteleme
- Alarm ve planların `%APPDATA%\kapanis` altında yerel saklanması
- Windows ile otomatik açılma, arka planda başlama ve sistem tepsisi
- Electron splash penceresi, sistem tepsisi ve frameless Windows kabuğu
- Her web sekmesi için merkezi `WebContentsView` lifecycle yönetimi
- Sekme başına favicon, geçmiş, indirme, izin, popup, fullscreen ve medya durumu
- Kalıcı browser session restore; kapatılan sekmelerin renderer ve medya süreçleri temizlenir
- Gelecekte telefondan komut vermek için RLS korumalı Supabase migration + isteğe bağlı Realtime köprüsü

## Geliştirme

Gerekenler: Node.js 22+ ve Windows için Electron build araçları. Electron kendi Chromium altyapısını paketler; ayrıca Chromium fork'u veya sistem WebView2 kurulumu gerekmez.

```powershell
npm install
npm run dev
```

`npm run dev:ui` yalnızca React renderer'ını sunar. `npm run dev`, Vite renderer'ını ve Electron main process'i birlikte başlatır.

## Windows installer

```powershell
npm run dist
```

NSIS installer: `release/`

`v*` etiketi GitHub'a gönderildiğinde `.github/workflows/release.yml` Windows installer'ını derler ve taslak GitHub Release'e ekler. Kod imzalama yapılandırılmadığı sürece Windows ilk açılışta bilinmeyen yayıncı uyarısı gösterebilir.

## Yapı

```text
src/
  components/          shadcn tabanlı kontroller ve native pencere kabuğu
  features/power/      kapatma / yeniden başlatma sayacı
  features/alarms/     alarm formu, tekrar seçenekleri ve bekleyenler
  features/remote/     yapılandırılırsa dinamik yüklenen Supabase köprüsü
  lib/desktop.ts       typed Electron preload IPC sınırı
  styles/compact.css   yalnızca iki üretim ekranının kullandığı stiller
electron/
  main.ts              güvenli IPC kayıtları ve uygulama yaşam döngüsü
  WindowManager.ts     pencere, splash ve sistem tepsisi
  BrowserManager.ts    merkezi browser orchestration
  TabManager.ts        sekme başına WebContentsView lifecycle
  SessionManager.ts    kalıcı browser profili, session ve history
  DownloadManager.ts   indirme yaşam döngüsü
  PermissionManager.ts site izinleri
  MediaManager.ts     medya metadata ve playback kontrolü
  preload.cts          allowlist'li contextBridge API
supabase/              RLS migration ve telefon kontrolü hazırlığı
tokens.css             OKLCH tasarım tokenları
```

## Supabase hazırlığı

Telefon kontrolü varsayılan olarak kapalıdır ve ana uygulamaya ağ yükü getirmez. Kurulum adımları [supabase/README.md](supabase/README.md) içindedir. İstemcilerde yalnızca publishable key kullanılmalıdır; `service_role` anahtarı masaüstü veya telefon uygulamasına eklenmez.

## Güvenlik

Kapatma ve yeniden başlatma komutları Electron main process'inde doğrulanıp doğrudan Windows `shutdown.exe` aracına iletilir. Remote web içerikleri `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` ile açılır; renderer'a yalnızca allowlist'li typed preload API'si verilir. Supabase komutları cihaz ve kullanıcı sahipliğini Row Level Security ile sınırlar; süresi dolan uzak komutlar çalıştırılmaz.

Android uygulamasındaki **CMD** sekmesi yalnızca eşleştirilmiş cihazdan, aynı özel yerel ağdayken çalışır. Her komut telefonda ayrıca onaylanır, 30 saniye ile sınırlandırılır ve sonucu telefona döner. Komutların yönetici olması için masaüstü uygulamasını Windows'ta **Yönetici olarak çalıştır** ile başlatın; uygulama UAC'yi atlamaya çalışmaz. Eşleştirme PIN'i keşif yanıtlarında paylaşılmaz ve ardışık hatalı PIN denemeleri geçici olarak sınırlandırılır. Yerel portu internete açmayın.

Değişiklikleri yayınlamadan önce `npm test`, `npm run build` ve `npm run dist` çalıştırın.

MIT lisanslıdır.
