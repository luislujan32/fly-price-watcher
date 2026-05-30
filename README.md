# Flight Price Watcher

Bot para monitorear precios de vuelos y recibir alertas por Telegram.

## Qué Hace

- Crea alertas de vuelos desde Telegram.
- Consulta Aerolíneas Argentinas.
- Filtra vuelos directos y aeropuerto exacto.
- Muestra el resultado inicial al crear una alerta.
- Monitorea diariamente con scheduler.
- Avisa por Telegram cuando hay precios relevantes.
- Soporta beta cerrada por aprobación admin.

## Requisitos

- Node.js 22 o compatible.
- MongoDB.
- Bot de Telegram.

## Estrategia De Configuración

Hay una sola plantilla versionada:

- `.env.example`: plantilla segura, sin tokens ni chat IDs reales.

Archivos reales no versionados:

- `.env`: configuración local.
- `.env.production`: configuración de beta/producción en VPS.

No subas `.env` ni `.env.production` a Git.

## Setup Local Desde Cero

```bash
cp .env.example .env
npm install
docker compose up -d mongo
npm run check:local
npm run start:local
```

Editá `.env` antes de iniciar si vas a usar Telegram/Aerolíneas:

```bash
ENABLE_TELEGRAM_BOT=true
ENABLED_FLIGHT_PROVIDERS=AEROLINEAS_ARGENTINAS
NOTIFICATION_CHANNELS=console,telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ADMIN_CHAT_IDS=
```

````md
Para siguientes ejecuciones, normalmente alcanza con:

```bash
docker compose up -d mongo
npm run start:local
```
````

## Producción Beta En VPS

Preparar env:

```bash
cp .env.example .env.production
```

Editar `.env.production` con valores reales. Para beta con Docker Compose y Mongo del compose, usar:

```bash
NODE_ENV=production
MONGODB_URI=mongodb://mongo:27017/flight-price-watcher
ENABLE_TELEGRAM_BOT=true
ENABLE_SCHEDULER=true
ENABLED_FLIGHT_PROVIDERS=AEROLINEAS_ARGENTINAS
NOTIFICATION_CHANNELS=telegram
TELEGRAM_ACCESS_MODE=approval
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ADMIN_CHAT_IDS=
```

Mongo no se expone públicamente en `docker-compose.prod.yml`. El bot usa polling, así que no necesita dominio ni HTTPS para esta beta.

Setup inicial:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm app npm run setup:prod
docker compose -f docker-compose.prod.yml run --rm app npm run check:prod
```

Levantar producción:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Parar:

```bash
docker compose -f docker-compose.prod.yml down
```

Ver logs:

```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f mongo
```

Actualizar después de `git pull`:

```bash
git pull
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml run --rm app npm run setup:prod
docker compose -f docker-compose.prod.yml up -d app
docker compose -f docker-compose.prod.yml logs -f app
```

## Comandos Principales

| Comando               | Uso                                                 |
| --------------------- | --------------------------------------------------- |
| `npm run check:local` | Valida configuración local                          |
| `npm run start:local` | Levanta la app local con bot/scheduler según `.env` |
| `npm run build`       | Compila TypeScript                                  |
| `npm test`            | Ejecuta tests                                       |
| `npm run check:prod`  | Valida configuración de producción                  |
| `npm run start:prod`  | Levanta la app compilada fuera de Docker            |

## Variables

Copiá `.env.example` y completá los valores necesarios.

Para beta real necesitás configurar principalmente:

- `MONGODB_URI`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_ADMIN_CHAT_IDS`

Las demás variables mínimas ya vienen con valores razonables en la plantilla.

## Flujo Telegram

1. El usuario escribe `/start`.
2. En modo `approval`, queda pendiente.
3. Un admin lo aprueba.
4. El usuario crea una alerta con `/crear`.
5. El bot consulta el precio inicial y luego monitorea diariamente.

Comandos principales:

- `/start`
- `/ayuda`
- `/crear`
- `/listar`
- `/estado`
- `/cancelar`

## Diagnóstico

```bash
npm run check:local
npm run telegram:debug-config
npm run telegram:test-admin-notification
```

## Notas De Seguridad

- No commitear `.env` ni `.env.production`.
- No subir tokens ni chat IDs reales.
- Usar `TELEGRAM_ACCESS_MODE=approval` para beta cerrada.
- `TELEGRAM_ADMIN_CHAT_IDS` es la fuente de verdad para permisos admin.
