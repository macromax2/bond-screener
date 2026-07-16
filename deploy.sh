#!/bin/bash
# BondPulse Deploy Script for Beget VPS
# Запусти на сервере: bash deploy.sh

set -e

echo "=== BondPulse Deploy ==="

# Установка зависимостей
echo "[1/7] Установка Python и PostgreSQL..."
apt update && apt upgrade -y
apt install -y python3-pip python3-venv postgresql nginx certbot python3-certbot-nginx

# Настройка PostgreSQL
echo "[2/7] Настройка PostgreSQL..."
su - postgres -c "psql -c \"CREATE USER bondpulse WITH PASSWORD 'bondpulse2024';\""
su - postgres -c "psql -c \"CREATE DATABASE bondpulse OWNER bondpulse;\""

# Клонирование репозитория
echo "[3/7] Загрузка кода..."
cd /opt
rm -rf bondpulse
git clone https://github.com/macromax2/bond-screener.git bondpulse
cd bondpulse

# Создание venv и установка зависимостей
echo "[4/7] Установка Python-зависимостей..."
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Создание .env файла
echo "[5/7] Создание конфигурации..."
cat > /opt/bondpulse/.env << 'ENVEOF'
DATABASE_URL=dbname=bondpulse user=bondpulse password=bondpulse2024 host=localhost
JWT_SECRET=bondpulse-secret-key-change-me
ENCRYPT_SALT=bondpulse-salt-v1
ENVEOF

# Создание systemd сервиса
echo "[6/7] Настройка автозапуска..."
cat > /etc/systemd/system/bondpulse.service << 'SERVICEEOF'
[Unit]
Description=BondPulse - Bond Screener
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/bondpulse
Environment=PATH=/opt/bondpulse/venv/bin
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
echo "[7/7] Настройка Nginx..."
cat > /etc/nginx/sites-available/bondpulse << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/bondpulse /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "=== Готово! ==="
echo "Открой: http://$(hostname -I | awk '{print $1}')"
echo ""
echo "Полезные команды:"
echo "  systemctl status bondpulse   - статус"
echo "  systemctl restart bondpulse  - перезапуск"
echo "  journalctl -u bondpulse -f   - логи"
