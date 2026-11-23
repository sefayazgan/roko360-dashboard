# ROKO 360 Cloudflare D1 kurulumu

Bu klasör, mevcut Cloudflare Worker API'sine kalıcı ve cihazlar arası ortak kayıt saklama özelliği ekler. EYS raporu özel GitHub deposundan okunmaya devam eder. Gizli anahtarlar bu depoya eklenmez.

## 1. D1 veritabanı oluştur
Cloudflare Dashboard → Workers & Pages → D1 SQL Database → Create database.
Ad: `roko360-db`

## 2. Tabloyu oluştur
D1 veritabanında Console / SQL alanını açıp `schema.sql` içeriğini çalıştır.

## 3. Worker bağlantısı
Workers & Pages → `roko360-api` → Settings → Bindings → Add → D1 database.
- Variable name: `DB`
- Database: `roko360-db`

Kaydet ve deploy et.

## 4. Worker kodu
Bu klasördeki `worker.js` dosyasının tamamını mevcut Worker kodunun yerine yapıştırıp Deploy et. Mevcut üç secret aynı adlarla korunmalı:
- `APP_PASSWORD`
- `SESSION_SECRET`
- `GITHUB_TOKEN`

GitHub token yalnızca özel `sefayazgan/eystrendyol` deposunda Contents Read-only erişiminde kalmalı. D1 verileri Worker'ın DB binding'i üzerinden saklanır.

## 5. Doğrulama
- `https://roko360-api.rvr9nm7bkk.workers.dev/` → `database: true` göstermeli.
- ROKO 360 panelinde EYS modülünden giriş yap.
- Bir görev veya finans kaydı ekle; sonra başka cihazda aynı paneli açıp giriş yap. Kayıtların gelmesi gerekir.

Not: Bu Worker tek kullanıcıya göre tasarlanmıştır. Panel kayıtları D1'de tek sahip hesabında tutulur. D1 binding eklenmeden `/api/data` uçları çalışmaz.
