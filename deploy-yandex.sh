#!/bin/bash
# BondPulse Deploy Script for Yandex Cloud
# Запусти на Compute Engine: bash deploy-yandex.sh

set -e

echo "=== BondPulse Deploy (Yandex Cloud) ==="

# Установка зависимостей
echo "[1/8] Установка Python и PostgreSQL..."
apt update && apt upgrade -y
apt install -y python3-pip python3-venv postgresql postgresql-contrib nginx

# Настройка PostgreSQL
echo "[2/8] Настройка PostgreSQL..."
systemctl enable postgresql
systemctl start postgresql

su - postgres -c "psql -c \"CREATE USER bondpulse WITH PASSWORD 'bondpulse2024';\""
su - postgres -c "psql -c \"CREATE DATABASE bondpulse OWNER bondpulse;\""
su - postgres -c "psql -c \"ALTER USER bondpulse CREATEDB;\""

# Клонирование репозитория
echo "[3/8] Загрузка кода..."
cd /opt
rm -rf bondpulse
git clone https://github.com/macromax2/bond-screener.git bondpulse
cd bondpulse

# Создание venv и установка зависимостей
echo "[4/8] Установка Python-зависимостей..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Создание .env файла
echo "[5/8] Создание конфигурации..."
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
cat > /opt/bondpulse/.env << ENVEOF
DATABASE_URL=dbname=bondpulse user=bondpulse password=bondpulse2024 host=localhost
JWT_SECRET=${JWT_SECRET}
ENCRYPT_SALT=bondpulse-salt-v1
ENVEOF

# Инициализация БД
echo "[6/8] Инициализация базы данных..."
cd /opt/bondpulse
source venv/bin/activate
python3 -c "
import sys
sys.path.insert(0, 'backend')
from main import init_db
init_db()
print('Database initialized')
"

# Создание systemd сервиса
echo "[7/8] Настройка автозапуска..."
cat > /etc/systemd/system/bondpulse.service << 'SERVICEEOF'
[Unit]
Description=BondPulse - Bond Screener
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/bondpulse
Environment=PATH=/opt/bondpulse/venv/bin
EnvironmentFile=/opt/bondpulse/.env
ExecStart=/opt/bondpulse/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable bondpulse
systemctl restart bondpulse

# Настройка Nginx
echo "[8/8] Настройка Nginx..."
cat > /etc/nginx/sites-available/bondpulse << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location /static/ {
        alias /opt/bondpulse/frontend/;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/bondpulse /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Получение IP
EXTERNAL_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo "=== Готово! ==="
echo ""
echo "Открой: http://${EXTERNAL_IP}"
echo ""
echo "Внешний IP сервера: ${EXTERNAL_IP}"
echo ""
echo "Полезные команды:"
echo "  systemctl status bondpulse   - статус приложения"
echo "  systemctl restart bondpulse  - перезапуск"
echo "  journalctl -u bondpulse -f   - логи в реальном времени"
echo "  systemctl status postgresql  - статус БД"
echo ""
echo "Для домена:"
echo "  1. Купи домен (reg.ru, namecheap, и т.д.)"
echo "  2. Создай A-запись: домен → ${EXTERNAL_IP}"
echo "  3. Запусти: certbot --nginx -d ТВОЙ_ДОМЕН"
