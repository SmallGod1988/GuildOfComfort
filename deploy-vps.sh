#!/usr/bin/env bash
# Деплой "Гильдии Комфорта" на чистый Ubuntu 22.04 VPS.
# Запускать от root: ssh root@151.241.217.218, затем выполнить этот скрипт.
set -euo pipefail

REPO_URL="https://github.com/SmallGod1988/GuildOfComfort.git"
BRANCH="claude/company-app-project-xxhilu"
APP_DIR="/opt/guildofcomfort"

echo "== 1/6: обновление системы =="
apt-get update -y
apt-get upgrade -y

echo "== 2/6: Docker =="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "== 3/6: swap 2G (пропускаем, если уже есть) =="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap создан"
else
  echo "swap уже существует, пропускаем"
fi

echo "== 4/6: firewall (22, 3000) =="
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 3000/tcp
ufw --force enable

echo "== 5/6: код и .env =="
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  AUTH_SECRET_VAL=$(openssl rand -base64 48)
  POSTGRES_PASSWORD_VAL=$(openssl rand -hex 16)
  ADMIN_PASSWORD_VAL=$(openssl rand -base64 12)
  ADMIN_EMAIL_VAL="${ADMIN_EMAIL:-admin@guildofcomfort.local}"
  cat > .env <<EOF
POSTGRES_USER=goc
POSTGRES_PASSWORD=$POSTGRES_PASSWORD_VAL
POSTGRES_DB=guild_of_comfort
AUTH_SECRET=$AUTH_SECRET_VAL
ADMIN_EMAIL=$ADMIN_EMAIL_VAL
ADMIN_PASSWORD=$ADMIN_PASSWORD_VAL
EOF
  chmod 600 .env
  echo "Сгенерирован новый .env"
else
  echo ".env уже существует, использую его"
fi

echo "== 6/6: сборка и запуск (на 1 vCore может занять несколько минут) =="
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm migrate

SERVER_IP=$(curl -s ifconfig.me || echo "<IP сервера>")
echo
echo "=================================================="
echo "Готово. Открой в браузере: http://$SERVER_IP:3000/login"
echo "Логин администратора — смотри файл $APP_DIR/.env"
echo "(ADMIN_EMAIL / ADMIN_PASSWORD). Сохрани его в надёжном месте:"
echo "=================================================="
grep -E '^(ADMIN_EMAIL|ADMIN_PASSWORD)=' .env
