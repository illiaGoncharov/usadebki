# Усадебки

Каталог русских усадеб: ЕГРОКН, Wikidata, лента, карта, карточки с источниками.

```bash
cp .env.example .env   # CARTO_KEY: carto.com/basemaps/apikey
npm install && npm run db:up && npm run db:migrate
npm run dev -- --port 3010
```

Импорт: `npm run import:egrkn`, обогащение: `npm run enrich:mo` (см. `package.json`). Данные и `.env` в git не входят.

Деплой и синхронизация с Neon: **[docs/шпаргалка.md](docs/шпаргалка.md)** (`git push` = код, `npm run db:sync-neon` = база на прод).

Сведения реестра — Минкультуры, ЕГРОКН. Тексты и фото — по лицензиям Wikimedia.