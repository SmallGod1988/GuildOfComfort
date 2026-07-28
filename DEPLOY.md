# Деплой

Два рабочих варианта. Если нет ограничений по картам/геолокации для
зарубежных платформ — вариант Б (Vercel) проще и быстрее. Если такие
ограничения есть (частый случай для российских компаний) — вариант А
(свой VPS) надёжнее, так как не зависит от иностранного биллинга.

## Вариант А: свой VPS + Docker (рекомендуется)

Понадобится: VPS с Docker (2 ГБ RAM достаточно), домен (не обязателен —
можно зайти по IP:3000, но без домена не будет HTTPS через Caddy).

1. **Установите Docker** на сервере, если его нет:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. **Склонируйте репозиторий** на сервер:
   ```bash
   git clone <URL вашего репозитория> guildofcomfort
   cd guildofcomfort
   ```

3. **Создайте `.env`** рядом с `docker-compose.prod.yml`:
   ```bash
   cp .env.example .env
   ```
   Заполните обязательные значения:
   - `POSTGRES_PASSWORD` — надёжный пароль для базы (только буквы/цифры,
     без спецсимволов, чтобы не ломать строку подключения)
   - `AUTH_SECRET` — длинная случайная строка: `openssl rand -base64 48`
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — учётные данные администратора,
     которые создаст сид-скрипт
   - `DATABASE_URL` можно не задавать — соберётся автоматически из
     `POSTGRES_*` (сервис `db` внутри Docker-сети)

4. **Соберите и запустите БД и приложение**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

5. **Примените миграции и создайте администратора** (один раз, и повторно
   после каждого обновления схемы):
   ```bash
   docker compose -f docker-compose.prod.yml run --rm migrate
   ```

6. Приложение слушает порт `3000` на сервере. Дальше — HTTPS:
   - **С доменом**: поставьте [Caddy](https://caddyphp.com) (или используйте
     уже имеющийся nginx) как реверс-прокси перед портом 3000 —
     см. `Caddyfile.example`. Caddy сам выпустит и обновит сертификат
     Let's Encrypt.
   - **Без домена**: откройте порт 3000 в файрволе и заходите по
     `http://IP-сервера:3000` (без HTTPS — подходит только для теста).

7. **Обновление после изменений в коде**:
   ```bash
   git pull
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml run --rm migrate
   ```

8. **Бэкапы БД** (важно — на VPS нет автоматических бэкапов из коробки):
   ```bash
   docker compose -f docker-compose.prod.yml exec db \
     pg_dump -U goc guild_of_comfort > backup-$(date +%F).sql
   ```
   Настройте это в cron на регулярной основе и копируйте бэкапы за
   пределы сервера.

## Вариант Б: Vercel + управляемый Postgres (Neon/Railway/Supabase)

1. Создайте базу Postgres в [Neon](https://neon.tech) (бесплатный тариф
   достаточен для старта) — получите `DATABASE_URL`.
2. На [vercel.com](https://vercel.com) → New Project → импортируйте этот
   GitHub-репозиторий.
3. В настройках проекта добавьте переменные окружения:
   `DATABASE_URL`, `AUTH_SECRET` (сгенерировать: `openssl rand -base64 48`).
4. Задеплойте. Сборка сама выполнит `prisma generate` (через `postinstall`
   в `package.json`) и `next build`.
5. Примените миграции и сид **один раз** с локальной машины, указав
   продакшн `DATABASE_URL`:
   ```bash
   DATABASE_URL="<строка подключения из Neon>" npx prisma migrate deploy
   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='StrongPass!' \
     DATABASE_URL="<строка подключения из Neon>" npx prisma db seed
   ```
6. При последующих изменениях схемы повторяйте `prisma migrate deploy`
   с продакшн `DATABASE_URL` (Vercel сам код не мигрирует).

## После первого деплоя (оба варианта)

- Смените пароль администратора — экрана смены пароля в приложении пока
  нет, обновите его через сид с новым `ADMIN_PASSWORD` или напрямую в БД.
- Никогда не используйте dev-значение `AUTH_SECRET` из `.env.example` в
  проде — смена секрета разлогинит всех пользователей, это нормально.
- Файлового хранилища (фото с объектов) в MVP нет — это отдельная будущая
  задача, деплой её не блокирует.
