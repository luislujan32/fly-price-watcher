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

## Setup Local Rápido

1. Copiar env:

```bash
cp .env.local.example .env
```

2. Editar `.env`:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_IDS=
TELEGRAM_CHAT_ID=
```

3. Instalar dependencias:

```bash
npm install
```

4. Levantar Mongo:

```bash
docker compose up -d mongo
```

5. Validar configuración:

```bash
npm run check:local
```

6. Levantar la app:

```bash
npm run start:local
```

## Comandos Principales

| Comando | Uso |
|---|---|
| `npm run start:local` | Levanta la app local con bot/scheduler según `.env` |
| `npm run dev:all` | Alias de `start:local` |
| `npm run check:local` | Valida configuración local |
| `npm run start:prod` | Levanta la app compilada |
| `npm run setup:prod` | Sincroniza índices y registra comandos de Telegram |
| `npm run check:prod` | Valida configuración de producción |
| `npm run watch:once` | Ejecuta monitoreo manual |
| `npm run aerolineas:test` | Diagnóstico de Aerolíneas |
| `npm run jetsmart:test` | Diagnóstico de JetSMART |
| `npm run dev:fix-search-provider` | Lista providerCode/allowStops de búsquedas existentes |
| `npm run telegram:test` | Prueba envío Telegram simple |
| `npm run telegram:debug-config` | Diagnóstico de configuración Telegram |
| `npm run telegram:test-admin-notification` | Prueba notificación a admins |
| `npm run telegram:set-commands` | Registra menú común del bot |
| `npm run db:sync-indexes` | Sincroniza índices Mongo/Mongoose |
| `npm run migrate:telegram-chat-id` | Asocia búsquedas legacy a un chat |
| `npm run seed` | Crea/actualiza búsquedas seed |
| `npm test` | Ejecuta tests |
| `npm run build` | Compila TypeScript |

## Variables Importantes

No están todas listadas acá. Usá `.env.local.example` y `.env.production.example` como fuente completa.

- `MONGODB_URI`: conexión Mongo.
- `ENABLE_TELEGRAM_BOT`: activa polling del bot.
- `ENABLE_SCHEDULER`: activa scheduler diario.
- `DAILY_RUN_TIME`: hora simple del monitoreo diario, por ejemplo `08:00`.
- `ENABLED_FLIGHT_PROVIDERS`: providers habilitados, por ejemplo `AEROLINEAS_ARGENTINAS`.
- `NOTIFICATION_CHANNELS`: canales, por ejemplo `console,telegram`.
- `TELEGRAM_BOT_TOKEN`: token del bot.
- `TELEGRAM_CHAT_ID`: chat por defecto para notificaciones simples.
- `TELEGRAM_ACCESS_MODE`: `approval`, `closed` u `open`.
- `TELEGRAM_ADMIN_CHAT_IDS`: admins que aprueban usuarios, separados por coma.
- `RUN_WATCH_AFTER_CREATE`: consulta precio apenas se crea una alerta.
- `TELEGRAM_HTTP_TIMEOUT_MS`: timeout para Telegram.
- `TELEGRAM_HTTP_RETRIES`: reintentos cortos para Telegram.
- `JETSMART_TEST_DEPARTURE`: fecha opcional para `npm run jetsmart:test` (si no está, se usa una fecha futura relativa).

## Archivos Env

- `.env`: archivo real de ejecución local. No se commitea.
- `.env.example`: plantilla segura y genérica.
- `.env.local.example`: plantilla recomendada para desarrollo local real.
- `.env.production.example`: plantilla recomendada para producción.

La app carga `.env` por defecto mediante `ConfigModule`.

## Flujo Telegram

1. El usuario escribe `/start`.
2. En modo `approval`, queda pendiente y se notifica a los admins.
3. Un admin aprueba desde Telegram.
4. El usuario usa `/crear` para crear una alerta.
5. Si `RUN_WATCH_AFTER_CREATE=true`, el bot consulta el precio actual y manda un resumen inicial.
6. El usuario usa `/listar` para ver alertas y botones de acción:
   - Ver detalle.
   - Pausar.
   - Activar.
   - Resumen.
   - Borrar.

Comandos útiles:

- `/start`
- `/ayuda`
- `/crear`
- `/listar`
- `/estado`
- `/cancelar`
- `/mi_chat_id`

Comandos admin:

- `/usuarios`
- `/pendientes`
- `/sync_admins`
- `/aprobar chatId`
- `/rechazar chatId`
- `/bloquear chatId`

## Diagnóstico

Telegram:

```bash
npm run telegram:debug-config
npm run telegram:test
npm run telegram:test-admin-notification
```

Aerolíneas:

```bash
ORIGIN=JUJ DESTINATION=AEP DEPARTURE_DATE=2026-10-10 RETURN_DATE=2026-10-15 TRIP_TYPE=ROUND_TRIP npm run aerolineas:test
```

Watcher manual:

```bash
npm run watch:once
```

Forzar resumen diario sólo para diagnóstico:

```bash
FORCE_DAILY_SUMMARY=true npm run watch:once
```

## Producción

1. Copiar plantilla:

```bash
cp .env.production.example .env
```

2. Completar variables reales:

```bash
MONGODB_URI=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ADMIN_CHAT_IDS=
```

3. Compilar:

```bash
npm run build
```

4. Setup inicial:

```bash
npm run setup:prod
```

5. Levantar:

```bash
npm run start:prod
```

Con Docker:

```bash
docker compose build
docker compose up -d mongo
docker compose run --rm app npm run setup:prod
docker compose up -d app
```

Mongo no se expone públicamente; `docker-compose.yml` lo publica sólo en `127.0.0.1`.

## Seed

El seed crea/actualiza búsquedas reales configuradas por env. Requiere `SEED_TELEGRAM_CHAT_ID`.

```bash
SEED_TELEGRAM_CHAT_ID=chat-id npm run seed
```

La demo `BUE to MDZ example` sólo se crea activa si:

```bash
ENABLE_DEMO_SEED=true
```

## Notas De Seguridad

- No commitear `.env`.
- No subir tokens ni chat IDs reales.
- Usar `TELEGRAM_ACCESS_MODE=approval` para beta cerrada.
- `TELEGRAM_ADMIN_CHAT_IDS` es la fuente de verdad para permisos admin.
- Si un admin existía como usuario legacy, ejecutar `/sync_admins`.
- Los logs y checks enmascaran valores sensibles.

## Mantenimiento

Sincronizar índices:

```bash
npm run db:sync-indexes
```

Migrar búsquedas legacy sin `telegramChatId`:

```bash
MIGRATE_TELEGRAM_CHAT_ID=chat-id npm run migrate:telegram-chat-id
```

Limpiar base local de pruebas, si hace falta:

```bash
docker compose down -v
docker compose up -d mongo
```
