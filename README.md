# Усадьбы

Светлый каталог русских усадеб: данные ЕГРОКН, подсказки из Викиданных и Википедии, лента, карта, карточки с источниками.

## Быстрый старт

```bash
cp .env.example .env
# Заполните CARTO_KEY: https://carto.com/basemaps/apikey (бесплатно для личного проекта)

npm install
npm run db:up
npm run db:migrate

# Импорт и обогащение — по желанию, см. package.json (import:egrkn, enrich:mo)

npm run dev -- --port 3010
```

Откройте [http://localhost:3010](http://localhost:3010).

Postgres в Docker слушает порт **5434** (см. `docker-compose.yml`). Файлы выгрузки ЕГРОКН и локальная БД в `data/` в репозиторий не входят — их нужно скачать и импортировать отдельно (`npm run import:egrkn`).

## Что внутри

- Next.js, Postgres, Drizzle
- Импорт усадеб из открытой выгрузки ЕГРОКН
- Фото и краткие тексты из Commons / Wikidata / русской Википедии (с атрибуцией)
- Правки с источником и простая админка

## Лицензии и данные

Сведения реестра — Минкультуры России, ЕГРОКН. Тексты и снимки из Википедии и Commons — по их лицензиям на страницах файлов и статей.

## Сайт для друзей (не только код на GitHub)

**GitHub хранит репозиторий**, но не запускает Next.js с Postgres. **GitHub Pages** для этого проекта не подходит: нужен сервер и живая база.

Удобная схема: репозиторий на GitHub → **Vercel** (бесплатный хостинг для Next.js) → **Neon** (бесплатный Postgres в облаке).

### 1. База в Neon

1. Зарегистрируйтесь на [neon.tech](https://neon.tech), создайте проект.
2. Скопируйте строку подключения (`postgres://…`), в настройках включите **Pooled connection** — её удобнее давать Vercel.
3. На своём компьютере в `.env` временно подставьте этот `DATABASE_URL` и выполните:
   ```bash
   npm run db:migrate
   ```
4. Перенесите данные с локальной машины (если Postgres уже заполнен):
   ```bash
   pg_dump "postgres://usadebki:usadebki@localhost:5434/usadebki" --no-owner --no-acl -Fc -f data/usadebki.dump
   pg_restore -d "ВАША_СТРОКА_NEON" --no-owner --no-acl data/usadebki.dump
   ```
   Либо заново: скачать ЕГРОКН и `npm run import:egrkn` (дольше).

### 2. Деплой на Vercel

1. [vercel.com](https://vercel.com) → войти через **GitHub**.
2. **Add New Project** → репозиторий `usadebki`.
3. **Environment Variables** (Production):
   - `DATABASE_URL` — строка Neon
   - `CARTO_KEY` — тот же ключ CARTO (карта)
   - `ADMIN_PASSWORD` — новый пароль админки (не из примера)
   - `ADMIN_SECRET` — длинная случайная строка
4. Deploy. После сборки будет ссылка вида `https://usadebki-….vercel.app` — её и можно слать друзьям.

Каждый `git push` в `main` Vercel подхватывает сам (если не отключили).

### 3. Что уже на GitHub

В репозитории workflow **CI**: при push гоняется `npm run build`. Зелёная галочка на коммите — код собирается; для работы сайта всё равно нужны шаги выше.

### Чего не выкладывать

Не коммитьте `.env`, дампы БД и архив ЕГРОКН — они уже в `.gitignore`. На Vercel и Neon секреты задаются только в панелях сервисов.