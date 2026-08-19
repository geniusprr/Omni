# Telefon kontrolü altyapısı

Bu klasör, ileride telefondan güvenli biçimde `shutdown`, `restart` veya `cancel` komutu göndermek için gereken ilk veritabanı ve Realtime katmanını içerir. Özellik arayüzde görünmez; Supabase değişkenleri yoksa ilgili JavaScript paketi bile yüklenmez.

## Kurulum

```powershell
npx supabase login
npx supabase link --project-ref PROJE_REF
npx supabase db push
Copy-Item .env.example .env
```

`.env` içine yalnızca Project URL, publishable key ve `devices` tablosundaki cihaz UUID’si girilir. `service_role` anahtarı masaüstü veya telefon uygulamasına hiçbir koşulda konmaz.

Köprü, oturum açmış kullanıcının yalnızca kendi cihazına ait, henüz süresi dolmamış `pending` komutlarını dinler. Komutların varsayılan teslim süresi beş dakikadır; çevrimdışı bir bilgisayar günler sonra açıldığında eski bir kapatma komutunu çalıştırmaz. Cihaz çevrimiçi olduğunda `last_seen_at` alanını da günceller.

Bir sonraki aşamada telefon istemcisi ve masaüstü kimlik doğrulama ekranı aynı Supabase Auth kullanıcısıyla bağlanmalıdır. RLS politikaları kullanıcı sahipliğini hem cihaz hem komut satırında doğrular. Telefon uygulaması komut eklerken `owner_id` alanını oturum kullanıcısı, `device_id` alanını seçilen cihaz ve gerekirse `expires_at` alanını kısa bir teslim süresi olarak göndermelidir.
