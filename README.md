# Bumbolandia Bank (Demo)

Demo web app of a fictitious bank with Dublo (DBL) currency, realtime transfers, and an admin panel.

Run locally:

1. Install dependencies:
   - `npm install`
2. Start the server:
   - `npm start`
3. Open `http://localhost:3000` in your browser.

Features:
- Registration with name + card number + CDS (demo, non-sensitive). The app assigns/uses a demo card.
- Realtime balance and transactions via Socket.IO.
- Transfers between users by card number.
- Admin panel (code: `TimeAbsolut434345@`) to view accounts and increase balances; realtime reflects on user dashboards.

Notes:
- This is a demo only. Data lives in memory and resets on restart.
- Do not use real personal or payment data.

Deploy (free domain on Render):

1. Push this project to a Git repository (GitHub/GitLab).
2. Create a new Web Service on Render and connect the repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: 18+
3. Save and deploy. Render выдаст бесплатный домен вида `https://bumbolandia-bank.onrender.com`.
4. При необходимости отредактируйте `render.yaml` (имя сервиса/регион).

Custom domain via DuckDNS (self-hosting):

1) Зарегистрируй поддомен на `https://www.duckdns.org` и получи token.
2) В `scripts/duckdns.env` заполни `DUCKDNS_DOMAIN` (без .duckdns.org) и `DUCKDNS_TOKEN`.
3) Настрой переадресацию портов 80/443 на твой ПК (роутер).
4) Установи Caddy (авто HTTPS). В корне отредактируй `Caddyfile`, заменив `YOUR_SUBDOMAIN`.
5) Запусти приложение: `npm start`. Затем Caddy: `caddy run --config Caddyfile`.
6) Настрой автообновление IP: планировщик задач Windows запускает `scripts/duckdns_update.ps1` каждые 10 минут.

Пример команды ручного обновления IP:
```
powershell -ExecutionPolicy Bypass -File .\scripts\duckdns_update.ps1 -Domain yoursubdomain -Token yourtoken
```

