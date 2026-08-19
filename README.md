# kapanış.

Windows için küçük, yerel ve düşük kaynak tüketimli bir kapatma sayacı + alarm uygulaması. Tauri 2, Rust ve React ile çalışır; web sürümü yoktur.

## Özellikler

- Bilgisayarı kapatma veya yeniden başlatma sayacı
- Aktif Windows planını tek tuşla iptal etme
- Tek seferlik, belirli aralıklarla veya ileri bir saatte başlayan alarmlar
- İptale kadar ya da 3/5/10 kez tekrarlama
- Üç Windows sistem sesi profili ve 5 dakika erteleme
- Alarm ve planların `%APPDATA%\kapanis` altında yerel saklanması
- Windows ile otomatik açılma, arka planda başlama ve sistem tepsisi
- Gerçek Tauri splash penceresi; sabit 780×620, kaydırmasız arayüz
- Gelecekte telefondan komut vermek için RLS korumalı Supabase migration + isteğe bağlı Realtime köprüsü

## Geliştirme

Gerekenler: Node.js 22+, Rust stable, MSVC C++ Build Tools ve WebView2.

```powershell
npm install
npm run tauri:dev
```

`npm run dev:ui` yalnızca Tauri’nin geliştirme içeriğini sunar. Uygulama tarayıcıda kullanılmak veya web’e dağıtılmak üzere tasarlanmamıştır.

## Windows installer

```powershell
npm run tauri:build
```

NSIS installer: `src-tauri/target/release/bundle/nsis/`

`v*` etiketi GitHub'a gönderildiğinde `.github/workflows/release.yml` Windows installer'ını derler ve taslak GitHub Release'e ekler. Kod imzalama yapılandırılmadığı sürece Windows ilk açılışta bilinmeyen yayıncı uyarısı gösterebilir.

## Yapı

```text
src/
  components/          shadcn tabanlı kontroller ve native pencere kabuğu
  features/power/      kapatma / yeniden başlatma sayacı
  features/alarms/     alarm formu, tekrar seçenekleri ve bekleyenler
  features/remote/     yapılandırılırsa dinamik yüklenen Supabase köprüsü
  lib/desktop.ts       Tauri IPC sınırı
  styles/compact.css   yalnızca iki üretim ekranının kullandığı stiller
src-tauri/src/lib.rs   Windows komutları, scheduler, ses, tray ve autostart
supabase/              RLS migration ve telefon kontrolü hazırlığı
tokens.css             OKLCH tasarım tokenları
```

## Supabase hazırlığı

Telefon kontrolü varsayılan olarak kapalıdır ve ana uygulamaya ağ yükü getirmez. Kurulum adımları [supabase/README.md](supabase/README.md) içindedir. İstemcilerde yalnızca publishable key kullanılmalıdır; `service_role` anahtarı masaüstü veya telefon uygulamasına eklenmez.

## Güvenlik

Kapatma ve yeniden başlatma komutları Rust katmanında doğrulanıp doğrudan Windows `shutdown.exe` aracına iletilir. Supabase komutları cihaz ve kullanıcı sahipliğini Row Level Security ile sınırlar; süresi dolan uzak komutlar çalıştırılmaz. Değişiklikleri yayınlamadan önce `npm run build`, `cargo fmt --all -- --check` ve `cargo test --locked` çalıştırın.

MIT lisanslıdır.
