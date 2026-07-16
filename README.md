# BondPulse

Скринер облигаций MOEX с фильтрами, календарём купонов, портфелем и AI-анализом.

## Быстрый старт локально

```bash
cd bond-screener/backend
pip install -r ../requirements.txt
python main.py
```

Открыть http://localhost:8080

## Деплой на Render.com (бесплатно)

1. Загрузить код на GitHub:
```bash
cd bond-screener
git init
git add .
git commit -m "BondPulse v7.0"
git remote add origin https://github.com/USERNAME/bondpulse.git
git push -u origin main
```

2. Зарегистрироваться на https://render.com

3. Нажать "New +" → "Web Service"

4. Подключить GitHub репозиторий

5. Настройки:
   - Name: bondpulse
   - Runtime: Python
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

6. Добавить переменную окружения:
   - Key: `DATABASE_URL`
   - Value: URL PostgreSQL базы данных

7. Нажать "Create Web Service"

Готово! Сервер будет доступен по адресу: https://bondpulse.onrender.com

## Стек

- Backend: Python, FastAPI, PostgreSQL
- Frontend: HTML, CSS, JavaScript
- Данные: MOEX ISS API
- AI: Анализ портфеля и рекомендации
