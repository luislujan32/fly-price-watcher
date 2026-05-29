# flight-price-watcher

MVP NestJS para monitorear precios diarios de vuelos, guardar histórico en MongoDB y enviar alertas por consola o Telegram.

## Instalación

```bash
npm install
```

## Variables de entorno

La app carga `.env` por defecto mediante `ConfigModule.forRoot(...)`. No se configuró un `envFilePath`, así que `.env` es el único archivo real esperado para ejecución local y producción.

Archivos disponibles:

- `.env`: archivo real de ejecución. No se commitea.
- `.env.example`: plantilla genérica segura, con Telegram apagado, provider `FAKE` y notificaciones por consola.
- `.env.local.example`: plantilla recomendada para desarrollo local real con bot, scheduler y Aerolíneas.
- `.env.production.example`: plantilla recomendada para producción, sin secretos ni IDs reales.

Primera vez en local:

```bash
cp .env.local.example .env
# editar .env con token, admins y Mongo
npm run check:local
npm run start:local
```

Para una plantilla mínima y segura:

```bash
cp .env.example .env
```

Para usar Telegram:

```bash
NOTIFICATION_CHANNELS=console,telegram
TELEGRAM_BOT_TOKEN=token-del-bot
TELEGRAM_CHAT_ID=chat-id
TELEGRAM_PARSE_MODE=none
```

El canal Telegram usa directamente `sendMessage` de Telegram Bot API. Por defecto envía texto plano con `TELEGRAM_PARSE_MODE=none` para evitar errores de Markdown con valores como `AEROLINEAS_ARGENTINAS` o `GOOD_TIME`.

Los resúmenes diarios se envían en texto plano con saltos de línea, emojis simples y etiquetas humanas. Los tags técnicos (`CHEAPEST`, `GOOD_TIME`, etc.) sólo se muestran si `DEBUG_NOTIFICATIONS=true`.

Valores soportados:

- `none`: texto plano, sin `parse_mode`.
- `MarkdownV2`: escapa caracteres especiales antes de enviar.
- `HTML`: escapa `&`, `<` y `>`.

Para validar Telegram sin watcher, Aerolíneas ni Mongo:

```bash
TELEGRAM_BOT_TOKEN=token-del-bot TELEGRAM_CHAT_ID=chat-id npm run telegram:test
```

Envía el mensaje `Flight Price Watcher: Telegram OK`. Si falta `TELEGRAM_BOT_TOKEN` o `TELEGRAM_CHAT_ID`, el comando falla con un error claro.

## Comandos

### Uso normal local

```bash
npm run start:local
```

Alias:

```bash
npm run dev:all
```

### Uso normal producción

```bash
npm run start:prod
```

### Setup inicial

```bash
npm run setup:prod
npm run db:sync-indexes
TELEGRAM_BOT_TOKEN=token-del-bot npm run telegram:set-commands
```

`setup:prod` sincroniza índices y registra comandos de Telegram. No corre seed salvo `RUN_SEED_ON_SETUP=true`.

### Diagnóstico

```bash
npm run watch:once
npm run telegram:test
npm run telegram:debug-config
npm run telegram:test-admin-notification
npm run aerolineas:test
npm run check:local
npm run check:prod
```

`check:local` y `check:prod` imprimen un resumen rápido:

```text
System check summary
Mongo: connected
Telegram bot: enabled (@flight_bot)
Telegram access mode: approval
Telegram admin chats: 1
Telegram allowed chats legacy: 0
Telegram legacy single allowed chat: not configured
Telegram default notification chat: configured
Run watch after create: enabled
Max searches per user: 5
Scheduler: enabled
Daily run time: 08:00
Effective cron: 0 8 * * *
Providers: AEROLINEAS_ARGENTINAS
Notification channels: console, telegram
Force daily summary: disabled
✅ System check passed
```

Si falta configuración crítica o Mongo no conecta, terminan con `❌ System check failed`.

### Migraciones

```bash
npm run migrate:telegram-chat-id
```

### Seed

```bash
npm run seed
```

### Qué NO Correr Normalmente

`FORCE_DAILY_SUMMARY=true`, `npm run aerolineas:test` y `npm run telegram:test` son herramientas de diagnóstico. No forman parte del uso diario: sirven para probar Telegram, forzar envíos o validar Aerolíneas de manera puntual.

`npm run telegram:debug-config` y `npm run telegram:test-admin-notification` también son diagnósticos: usalos cuando cambies admins, tokens o modo de acceso.

`start:local` usa la misma entrada principal que producción (`src/main.ts`) vía `ts-node`. No usa watch mode porque el proceso mantiene scheduler y polling activos; reiniciarlo explícitamente evita duplicar timers durante cambios de código.

## Flujo Recomendado

### Desarrollo Diario

```bash
docker compose up -d mongo
npm run start:local
```

### Primera Vez En Local

```bash
cp .env.local.example .env
npm install
docker compose up -d mongo
npm run db:sync-indexes
TELEGRAM_BOT_TOKEN=token-del-bot npm run telegram:set-commands
npm run start:local
```

### Producción

```bash
# copiar .env.production.example a .env y completar secretos en el servidor
npm run setup:prod
npm run start:prod
```

## Telegram Bot

El bot conversacional inicial usa polling con `getUpdates`. No usa webhooks.

Config:

```bash
TELEGRAM_BOT_TOKEN=token-del-bot
ENABLE_TELEGRAM_BOT=true
TELEGRAM_ACCESS_MODE=approval
TELEGRAM_ADMIN_CHAT_IDS=admin-chat-id
TELEGRAM_ALLOWED_CHAT_IDS=
TELEGRAM_ALLOWED_CHAT_ID=
TELEGRAM_CHAT_ID=
TELEGRAM_PARSE_MODE=none
TELEGRAM_POLLING_INTERVAL_MS=3000
TELEGRAM_HTTP_TIMEOUT_MS=10000
TELEGRAM_HTTP_RETRIES=1
TELEGRAM_WIZARD_TTL_MINUTES=15
RUN_WATCH_AFTER_CREATE=true
MAX_SEARCHES_PER_USER=5
```

Modos de acceso:

- `TELEGRAM_ACCESS_MODE=approval`: beta cerrada con aprobación. Cualquier usuario puede pedir acceso con `/start`, pero sólo usa el bot después de que un admin lo apruebe.
- `TELEGRAM_ACCESS_MODE=closed`: sólo entran admins y chats explícitos de `TELEGRAM_ALLOWED_CHAT_IDS`.
- `TELEGRAM_ACCESS_MODE=open`: cualquier usuario puede usar el bot; útil sólo para pruebas controladas.

Variables Telegram principales:

- `TELEGRAM_BOT_TOKEN`: token del bot.
- `TELEGRAM_ADMIN_CHAT_IDS`: variable oficial para admins. Son quienes aprueban usuarios y pueden usar comandos admin; acepta varios IDs separados por coma.
- `TELEGRAM_ALLOWED_CHAT_IDS`: allowlist legacy/manual. Permite chats sin pasar por aprobación, pero no reemplaza admins.
- `TELEGRAM_ALLOWED_CHAT_ID`: compatibilidad legacy con un solo chat permitido.
- `TELEGRAM_CHAT_ID`: chat por defecto para notificaciones simples y `npm run telegram:test`.
- `TELEGRAM_ACCESS_MODE`: `approval`, `closed` u `open`.
- `TELEGRAM_PARSE_MODE`: por defecto `none`.
- `TELEGRAM_POLLING_INTERVAL_MS`: intervalo de polling.
- `TELEGRAM_HTTP_TIMEOUT_MS`: timeout de requests contra Telegram.
- `TELEGRAM_HTTP_RETRIES`: reintentos cortos para errores transitorios de Telegram.
- `TELEGRAM_WIZARD_TTL_MINUTES`: vencimiento del wizard.
- `MAX_SEARCHES_PER_USER`: límite de alertas activas por usuario.
- `RUN_WATCH_AFTER_CREATE`: consulta precio apenas se crea una alerta.

Si Telegram tiene un timeout, `fetch failed`, un 5xx o un 429, el bot lo loguea, reintenta según `TELEGRAM_HTTP_RETRIES` y mantiene el polling activo. Un error enviando el mensaje de error al usuario no tumba el proceso.

En producción, si `ENABLE_TELEGRAM_BOT=true` y el modo es `approval` o `closed`, `npm run check:prod` falla si no hay `TELEGRAM_ADMIN_CHAT_IDS`.

Recomendación: usá `approval` para una beta cerrada. Evitá `open` en producción: `npm run check:prod` muestra un warning porque cualquier usuario que encuentre el bot podrá usarlo.

Flujo de aprobación:

1. El usuario escribe `/start`.
2. Si no existe y el modo es `approval`, queda `pending`.
3. El admin recibe una solicitud con botones `Aprobar`, `Rechazar` y `Bloquear`.
4. Si el admin aprueba, el usuario recibe `✅ Tu acceso fue aprobado. Ya podés usar el bot.`.

Estados posibles de usuario: `pending`, `approved`, `rejected`, `blocked`. Usuarios rechazados o bloqueados reciben `No tenés acceso a este bot.`.

Las búsquedas creadas desde Telegram se guardan con `telegramChatId` y los comandos de gestión sólo resuelven búsquedas de ese chat. Las búsquedas sin `telegramChatId` no aparecen en `/listar` y no se pueden administrar desde el bot; migrá datos antiguos con `npm run migrate:telegram-chat-id`.

Para correrlo localmente:

```bash
npm run start:local
```

El comando levanta la app principal con bot y scheduler según `ENABLE_TELEGRAM_BOT` y `ENABLE_SCHEDULER`. Si necesitás aislar sólo el bot para diagnóstico, sigue disponible `npm run telegram:bot`.

En producción no hace falta correr `telegram:bot` por separado: `npm run start:prod` levanta el bot si `ENABLE_TELEGRAM_BOT=true`.

Para configurar el menú que aparece al escribir `/` en Telegram:

```bash
TELEGRAM_BOT_TOKEN=token-del-bot npm run telegram:set-commands
```

Esto registra el menú común con `setMyCommands`. No ejecuta el watcher, no consulta Aerolíneas y no toca Mongo. Los comandos admin siguen disponibles para admins, pero no se publican en el menú común.

### Debug de Telegram

Para revisar configuración sin imprimir tokens completos:

```bash
npm run telegram:debug-config
```

Muestra bot username vía `getMe`, modo de acceso, cantidad de admins, admins enmascarados, allowlists legacy enmascaradas, `RUN_WATCH_AFTER_CREATE` y `MAX_SEARCHES_PER_USER`.

`TELEGRAM_ADMIN_CHAT_IDS` es la fuente de verdad para permisos admin. Si un chatId está en esa variable, el bot lo trata como admin aunque el registro viejo en `telegram_users` tenga `isAdmin=false`.

Para probar si los admins reciben mensajes:

```bash
npm run telegram:test-admin-notification
```

Envía `✅ Test de notificación admin OK` a cada chat de `TELEGRAM_ADMIN_CHAT_IDS`. Si un admin falla, lo reporta sin cortar el intento de los demás.

Para conocer tu chat ID desde Telegram:

```text
/mi_chat_id
```

Funciona para cualquier usuario, incluso no aprobado. Si un admin no recibe solicitudes, revisá:

1. `TELEGRAM_ADMIN_CHAT_IDS` contiene el chatId correcto.
2. El admin escribió al bot al menos una vez.
3. `npm run telegram:debug-config` valida el token con `getMe`.
4. `npm run telegram:test-admin-notification` llega al admin.
5. `check:prod` no muestra errores de `TELEGRAM_ADMIN_CHAT_IDS`.
6. Si el usuario admin ya existía aprobado por allowlist, ejecutar `/sync_admins`.

Comandos comunes:

- `/start`: muestra un saludo breve con botones inline.
- `/ayuda`: muestra ayuda simple.
- `/help`: alias de ayuda.
- `/crear`: inicia un wizard por texto para crear una búsqueda.
- `/listar`: lista búsquedas no borradas con número, estado y botones por búsqueda.
- `/estado`: muestra modo del bot, alertas activas, límite, scheduler y consulta al crear.
- `/cancelar`: limpia la operación conversacional actual.
- `/mi_chat_id`: responde el chatId actual para debug/configuración.

Usá `/listar` para ver tus alertas. Desde ahí aparecen botones para ver detalle, pausar, activar, pedir resumen o borrar sin recordar números.

Comandos admin:

- `/pendientes`: admin; lista solicitudes pendientes.
- `/usuarios`: admin; lista usuarios agrupados por `pending`, `approved`, `rejected` y `blocked`.
- `/sync_admins`: admin; crea o actualiza en `telegram_users` los admins configurados en `TELEGRAM_ADMIN_CHAT_IDS`.
- `/aprobar chatId`: admin; aprueba un usuario.
- `/rechazar chatId`: admin; rechaza un usuario.
- `/bloquear chatId`: admin; bloquea un usuario.

Cuando confirmás una alerta desde `/crear`, si `RUN_WATCH_AFTER_CREATE=true` el bot guarda la alerta y consulta sólo esa búsqueda para mostrar el precio actual cuanto antes. Si la consulta falla, la alerta queda creada y se revisa en la próxima ejecución programada. Si `RUN_WATCH_AFTER_CREATE=false`, la alerta se crea y espera al scheduler.

`MAX_SEARCHES_PER_USER=5` limita la cantidad de alertas activas por chat. Si el usuario llega al límite, el bot responde `Llegaste al límite de 5 alertas activas.`.

`/start` muestra estos botones:

```text
➕ Crear alerta
📋 Mis alertas
🔄 Resumen ahora
⚙️ Preferencias
❓ Ayuda
```

Si usás comandos manuales como `/ver 1`, el número corresponde al orden mostrado por `/listar`. El criterio es estable: búsquedas no borradas del chat actual ordenadas por `createdAt` ascendente y `_id` ascendente.

Ejemplo:

```text
/listar

📋 Mis alertas

1. ✈️ Viaje Octubre
JUJ → AEP → JUJ
10/10/2026 al 15/10/2026
Estado: activa
Objetivo: $280.000 ARS

2. ✈️ Viaje Diciembre
JUJ → AEP → JUJ
20/12/2026 al 28/12/2026
Estado: pausada
Objetivo: sin definir
```

Cada búsqueda incluye botones inline:

```text
🔎 Ver N
⏸ Pausar N / ▶️ Activar N
🔄 Resumen N
🗑 Borrar N
```

El botón `🔄 Resumen` muestra la última corrida guardada en Mongo para esa alerta. No ejecuta el watcher ni consulta Aerolíneas.

El botón `🗑 Borrar` no elimina directamente. Primero pide confirmación con `✅ Sí, borrar` y `❌ Cancelar`; recién al confirmar hace soft delete.

Comandos de gestión:

```text
/ver 1
/pausar 1
/activar 2
/borrar 2
```

`/borrar` hace soft delete: setea `isActive=false` y `deletedAt`, sin eliminar físicamente de Mongo.

Flujo de `/crear`:

1. Nombre de la alerta. Se valida duplicado inmediatamente dentro del `telegramChatId`.
2. Si el nombre existe, propone uno disponible, por ejemplo `Iron Maiden (2)`, con botones para usarlo, escribir otro o cancelar.
3. Origen: ciudad, provincia, aeropuerto, alias común o código IATA.
4. Destino: ciudad, provincia, aeropuerto, alias común o código IATA, distinto del origen.
5. Fecha de ida en formato `DD/MM/YYYY` o `YYYY-MM-DD`.
6. Fecha de vuelta en esos formatos, o `-` para solo ida.
7. Adultos con botones: `1 adulto`, `2 adultos`, `Otro`.
8. Precio objetivo con botones: `Omitir` o `Ingresar precio`.
9. Confirmación final con botones: `✅ Crear alerta`, `✏️ Editar`, `❌ Cancelar`.

Ejemplos válidos para origen/destino:

```text
Jujuy
Aeroparque
Buenos Aires
AEP
JUJ
Ezeiza
El Plumerillo
```

Además, el wizard muestra botones rápidos para aeropuertos frecuentes: `JUJ — Jujuy`, `AEP — Aeroparque`, `EZE — Ezeiza`, `MDZ — Mendoza`, `COR — Córdoba` y `SLA — Salta`. El usuario puede tocar un botón o escribir texto libre.

Si encuentra una sola opción, el bot la selecciona automáticamente y muestra nombre humano:

```text
JUJ — San Salvador de Jujuy Gobernador Horacio Guzmán
AEP — Buenos Aires Aeroparque Jorge Newbery
```

Si encuentra varias opciones, muestra botones inline. Por ejemplo, `Buenos Aires` ofrece `AEP — Aeroparque` y `EZE — Ezeiza`.

Si el usuario escribe un código IATA de 3 letras que no está en el catálogo local, el bot advierte pero permite continuar. `✏️ Editar` reinicia el wizard desde el nombre en esta fase.

Defaults usados al crear:

- `providerCode=AEROLINEAS_ARGENTINAS`
- `cabinClass=ECONOMY`
- `currency=ARS`
- `notifyAlways=true`
- `notifyOnPriceDrop=true`
- `isActive=true`

El estado conversacional se guarda en `telegram_conversation_states` con TTL configurable por `TELEGRAM_WIZARD_TTL_MINUTES` (`15` por defecto). `/cancelar` borra ese estado.

El seed real requiere `SEED_TELEGRAM_CHAT_ID` para asociar `Viaje Octubre` y `Viaje Diciembre` al chat autorizado:

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado
npm run seed
```

Si `SEED_TELEGRAM_CHAT_ID` queda vacío, `npm run seed` falla con un error claro para evitar crear búsquedas que el bot no pueda administrar.

Para migrar búsquedas legacy existentes y asociarlas al chat permitido:

```bash
npm run migrate:telegram-chat-id
```

El comando usa `TELEGRAM_ALLOWED_CHAT_ID` por defecto. También podés indicar un chat puntual:

```bash
MIGRATE_TELEGRAM_CHAT_ID=chat-id-autorizado npm run migrate:telegram-chat-id
```

Sólo actualiza búsquedas sin `telegramChatId`; no modifica búsquedas que ya estén asociadas a un chat. Al finalizar imprime cuántas encontró, cuántas actualizó y los nombres actualizados. Después de correr esta migración, el bot deja de aplicar cualquier fallback legacy.

Versiones anteriores declaraban `name` como índice único global en Mongo. El schema actual usa índice único compuesto `{ telegramChatId: 1, name: 1 }`. Para eliminar índices obsoletos como `name_1` y crear los nuevos:

```bash
npm run db:sync-indexes
```

El comando conecta a Mongo usando `MONGODB_URI`, ejecuta `syncIndexes()` sobre `FlightSearch` y loguea índices antes/después y cuáles se eliminaron.

Para limpiar la base local de pruebas completa:

```bash
docker exec -it flight-price-watcher-mongo mongosh flight-price-watcher --eval 'db.dropDatabase()'
```

Después podés recrear datos con:

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado npm run seed
```

## Correr MongoDB

Con Docker:

```bash
docker run --name flight-price-watcher-mongo -p 27017:27017 -d mongo:7
```

Si ya existe el contenedor:

```bash
docker start flight-price-watcher-mongo
```

## Docker Compose

Para correr en Docker local o en un VPS barato:

```bash
cp .env.production.example .env
# editar MONGODB_URI, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ADMIN_CHAT_IDS y SEED_TELEGRAM_CHAT_ID
docker compose build
docker compose up -d mongo
```

Mongo usa el volumen persistente `mongo_data`. Para desarrollo local expone `127.0.0.1:27017`, no públicamente. La app no expone puertos porque este MVP no levanta API web.

Setup de producción:

```bash
docker compose run --rm app npm run setup:prod
```

Chequeo de configuración:

```bash
docker compose run --rm app npm run check:prod
```

Seed inicial dentro de Docker:

```bash
docker compose run --rm app npm run seed
```

Probar Telegram desde Docker:

```bash
docker compose run --rm app npm run telegram:test
```

Ejecutar el watcher una vez:

```bash
docker compose run --rm app npm run watch:once
```

Para producción normal, levantar la app:

```bash
docker compose up -d app
```

Con `ENABLE_SCHEDULER=true` ejecuta el cron interno. Con `ENABLE_TELEGRAM_BOT=true` levanta polling del bot. Los comandos `watch:once`, `telegram:test` y `aerolineas:test` quedan sólo para diagnóstico.

Para VPS también podés dejar `mongo` levantado y usar cron del host si preferís una corrida manual diaria en vez del scheduler interno.

Ejemplo de cron diario a las 08:00 del servidor:

```cron
0 8 * * * cd /opt/flight-price-watcher && /usr/bin/docker compose run --rm app npm run watch:once >> /var/log/flight-price-watcher.log 2>&1
```

Si querés forzar un resumen diario para probar Telegram desde el flujo real:

```bash
docker compose run --rm app sh -c 'FORCE_DAILY_SUMMARY=true npm run watch:once'
```

## Seed inicial

Crea o actualiza de forma idempotente dos búsquedas reales:

- `Viaje Octubre`: `JUJ -> AEP -> JUJ`, ida `2026-10-10`, vuelta `2026-10-15`.
- `Viaje Diciembre`: `JUJ -> AEP -> JUJ`, ida `2026-12-20`, vuelta `2026-12-28`.

Ambas usan `providerCode=AEROLINEAS_ARGENTINAS`, `ROUND_TRIP`, `ECONOMY`, `adults=1`, `notifyAlways=true` y `notifyOnPriceDrop=true`.

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado npm run seed
```

También se puede ejecutar el seed al iniciar:

```bash
SEED_EXAMPLE_SEARCHES=true npm start
```

El seed es idempotente por `name` dentro de `telegramChatId`. `SEED_TELEGRAM_CHAT_ID` es obligatorio para no crear búsquedas fuera del scope del bot.

La búsqueda demo histórica `BUE to MDZ example` no se crea en modo real. Si ya existe en Mongo, queda desactivada por defecto cada vez que corrés `npm run seed`, así no vuelve a entrar en el watcher real. Para crearla o activarla explícitamente:

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado ENABLE_DEMO_SEED=true npm run seed
```

Con `ENABLE_DEMO_SEED=false` o sin definir, esa demo no se crea; si ya existía, se actualiza a `isActive=false`.

Para editar fechas o precios objetivo, cambiá variables de entorno antes de correr el seed:

```bash
SEED_OCTOBER_DEPARTURE_DATE=2026-10-10 \
SEED_OCTOBER_RETURN_DATE=2026-10-15 \
SEED_OCTOBER_TARGET_PRICE=280000 \
SEED_DECEMBER_DEPARTURE_DATE=2026-12-20 \
SEED_DECEMBER_RETURN_DATE=2026-12-28 \
SEED_DECEMBER_TARGET_PRICE=230000 \
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado \
npm run seed
```

También podés dejarlas fijas en `.env`.

## Correr el proyecto

```bash
npm start
```

Modo desarrollo:

```bash
npm run start:dev
```

El scheduler usa `DAILY_RUN_TIME=08:00` por defecto y construye el cron efectivo automáticamente. Ejemplos:

```bash
DAILY_RUN_TIME=08:00 # 0 8 * * *
DAILY_RUN_TIME=22:52 # 52 22 * * *
```

`DAILY_CRON` sigue disponible como opción avanzada y tiene prioridad sobre `DAILY_RUN_TIME`.

Para pruebas locales, si ahora son 22:49 podés poner `DAILY_RUN_TIME=22:52` y correr `npm run start:local`. La app debe estar corriendo en ese horario. En producción, el proceso debe quedar levantado permanentemente.

## Logs

`LOG_LEVEL` controla el logger general de Nest. Valores soportados:

- `silent`
- `error`
- `warn`
- `info`
- `debug`
- `verbose`

Por defecto:

```bash
LOG_LEVEL=info
ENABLE_VERBOSE_WATCH_LOGS=false
```

Con `ENABLE_VERBOSE_WATCH_LOGS=false`, el watcher evita logs repetitivos por opción (`Price found`, `Snapshot saved`, intentos de provider) y deja sólo inicio, búsquedas activas, providers, un resumen por búsqueda/provider y el resumen final.

Output normal esperado:

```text
Starting flight price watch run.
Active searches: 2.
Providers used: AEROLINEAS_ARGENTINAS.
Watch summary: search="Viaje Octubre", route=JUJ-AEP, provider=AEROLINEAS_ARGENTINAS, status=SUCCESS, validOptions=5, cheapestPrice=287948 ARS, recommendedPrice=287948 ARS, alertsGenerated=1.
Flight price watch finished: snapshots=0, watchRuns=2, alerts=2, notificationAttempts=2, notificationSuccesses=2, notificationFailures=0, errors=0.
```

Para desarrollo:

```bash
ENABLE_VERBOSE_WATCH_LOGS=true npm run watch:once
```

Output verbose esperado:

```text
Options found: search="Viaje Octubre", route=JUJ-AEP, provider=AEROLINEAS_ARGENTINAS, validOptions=5, cheapest=287948 ARS, recommended=287948 ARS, recommendedTags=CHEAPEST,GOOD_TIME,RECOMMENDED.
Price found: search="Viaje Octubre", route=JUJ-AEP, provider=AEROLINEAS_ARGENTINAS, price=287948 ARS, tags=CHEAPEST,GOOD_TIME,RECOMMENDED.
Snapshot saved: search="Viaje Octubre", route=JUJ-AEP, provider=AEROLINEAS_ARGENTINAS, price=287948 ARS.
Alert generated: search="Viaje Octubre", route=JUJ-AEP, provider=AEROLINEAS_ARGENTINAS, type=DAILY_SUMMARY.
```

## Retención de datos

Los datos históricos se limpian con índices TTL de MongoDB usando `expiresAt`.

```bash
DATA_RETENTION_DAYS_AFTER_TRIP=30
```

La fecha se calcula así:

```ts
baseDate = returnDate ?? departureDate
expiresAt = baseDate + DATA_RETENTION_DAYS_AFTER_TRIP días
```

Colecciones con TTL:

- `flight_watch_runs`
- `flight_alerts`
- `flight_price_snapshots`

`FlightSearch` no tiene TTL y no se borra automáticamente en esta etapa.

Ejemplos con el valor por defecto:

- Viaje Octubre: `returnDate=2026-10-15` → `expiresAt=2026-11-14`
- Viaje Diciembre: `returnDate=2026-12-28` → `expiresAt=2027-01-27`

MongoDB borra documentos TTL de forma asíncrona, no exactamente en el segundo del vencimiento.

Para completar `expiresAt` manualmente en datos viejos, se puede ejecutar una actualización específica en Mongo según la fecha del viaje. Ejemplo orientativo para runs de una búsqueda:

```js
db.flight_watch_runs.updateMany(
  { searchId: "search-id", expiresAt: { $exists: false } },
  { $set: { expiresAt: ISODate("2026-11-14T00:00:00.000Z") } }
)
```

## Ejecutar monitoreo manual

Para correr una ejecución puntual sin esperar al cron:

```bash
npm run watch:once
```

Sirve para probar el flujo completo con las búsquedas activas actuales: consulta providers, guarda `FlightWatchRun`, evalúa alertas, deduplica y envía notificaciones. Usa la misma lógica que el cron diario.

Por defecto `PERSIST_PRICE_SNAPSHOTS=false`: no se guardan snapshots individuales por opción. Si necesitás histórico fino para debugging o análisis, activalo explícitamente:

```bash
PERSIST_PRICE_SNAPSHOTS=true npm run watch:once
```

Por defecto `PERSIST_PROVIDER_DIAGNOSTICS=false`: `FlightWatchRun` guarda sólo `diagnosticsSummary` compacto. Para debugging puntual podés persistir detalles extendidos en `diagnosticsDetails`:

```bash
PERSIST_PROVIDER_DIAGNOSTICS=true npm run watch:once
```

Para diagnóstico de Telegram desde el flujo real, se puede forzar sólo el envío de `DAILY_SUMMARY` aunque ya exista una alerta diaria similar:

```bash
FORCE_DAILY_SUMMARY=true \
NOTIFICATION_CHANNELS=console,telegram \
TELEGRAM_PARSE_MODE=none \
ENABLED_FLIGHT_PROVIDERS=AEROLINEAS_ARGENTINAS \
npm run watch:once
```

Por defecto `FORCE_DAILY_SUMMARY=false`. El flag fuerza el envío de la notificación, no la creación de alertas duplicadas: si ya existe un `DAILY_SUMMARY` para la búsqueda/provider/día, se reutiliza el mensaje actual para notificar sin insertar otro documento y sin tocar el índice único de Mongo. No fuerza `PRICE_DROP_CHEAPEST`, `PRICE_DROP_RECOMMENDED`, `TARGET_PRICE_REACHED` ni `LOWEST_HISTORICAL_PRICE`; esos tipos siguen deduplicados por día.

## Validar escenarios del MVP

`FakeFlightProvider` permite simular precios con `FAKE_PROVIDER_SCENARIO`:

- `normal`: precio base de referencia, `180000 ARS`.
- `no_change`: mismo precio que `normal`, útil para validar que no hay caída.
- `price_drop`: precio menor, `130000 ARS`.
- `target_reached`: precio debajo del target del seed, `145000 ARS`.
- `lowest_historical`: precio muy bajo, `90000 ARS`.

Receta recomendada para validar de punta a punta:

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado npm run seed
FAKE_PROVIDER_SCENARIO=normal npm run watch:once
FAKE_PROVIDER_SCENARIO=price_drop npm run watch:once
```

En la segunda ejecución deberías ver logs con `PRICE_DROP_CHEAPEST`. Cuando el provider informa resumen de opciones, la comparación de caída usa `cheapestPrice` y `recommendedPrice` del resumen, no snapshots secundarios. Como el seed tiene `targetPrice=150000`, también puede generar `TARGET_PRICE_REACHED` si el precio queda por debajo del objetivo.

Para validar precio objetivo:

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado npm run seed
FAKE_PROVIDER_SCENARIO=target_reached npm run watch:once
```

Para validar sin cambios, corré dos veces con el mismo precio:

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado npm run seed
FAKE_PROVIDER_SCENARIO=normal npm run watch:once
FAKE_PROVIDER_SCENARIO=no_change npm run watch:once
```

Con `notifyAlways=true` en el seed, puede seguir apareciendo `DAILY_SUMMARY`; lo importante en este escenario es que no aparezca `PRICE_DROP_CHEAPEST`.

Para verificar alertas persistidas en Mongo:

```bash
docker exec -it flight-price-watcher-mongo mongosh flight-price-watcher
db.flight_alerts.find().sort({ createdAt: -1 }).limit(10).pretty()
db.flight_price_snapshots.find().sort({ capturedAt: -1 }).limit(10).pretty()
```

Los logs normales de `watch:once` muestran un resumen por búsqueda/provider. Para ver precio por opción y tipo de alerta individual, usar `ENABLE_VERBOSE_WATCH_LOGS=true`.

## Habilitar Aerolíneas Argentinas

El provider real de Aerolíneas Argentinas está detrás del mismo `FlightProviderPort` que el fake. Para habilitarlo:

```bash
ENABLED_FLIGHT_PROVIDERS=FAKE,AEROLINEAS_ARGENTINAS npm run watch:once
```

O en `.env`:

```bash
ENABLED_FLIGHT_PROVIDERS=FAKE,AEROLINEAS_ARGENTINAS
AEROLINEAS_API_BASE_URL=https://api.aerolineas.com.ar
AEROLINEAS_WEB_BASE_URL=https://www.aerolineas.com.ar
AEROLINEAS_HTTP_TIMEOUT_MS=15000
AEROLINEAS_HTTP_RETRIES=1
AEROLINEAS_TOKEN_TTL_SECONDS=900
```

El provider:

- Descarga la home pública de Aerolíneas.
- Extrae `window.__ACCESS_TOKEN__`.
- Cachea el token en memoria usando `exp` del JWT cuando está disponible.
- Consulta `GET /v1/flights/offers`.
- Devuelve hasta `MAX_QUOTES_PER_SEARCH` combinaciones válidas ordenadas por precio.
- En Aerolíneas, cada quote puede incluir desglose `outboundPrice`, `inboundPrice`, `pricingSource` y vuelos válidos por tramo (`outboundOptions` / `inboundOptions`) cuando la respuesta permite inferirlo.
- Las tarifas del mismo vuelo se agrupan dentro de `fares`: por ejemplo `Base`, `Plus` y `Flex` aparecen bajo un único vuelo con `cheapestPrice` y `cheapestFareName`.
- Etiqueta la opción `CHEAPEST`, horarios incómodos (`EARLY_MORNING`, `LATE_NIGHT`), horarios razonables (`GOOD_TIME`) y la opción `RECOMMENDED`.

Ejemplo:

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado npm run seed
ENABLED_FLIGHT_PROVIDERS=AEROLINEAS_ARGENTINAS npm run watch:once
```

Con las búsquedas reales del seed:

```bash
SEED_TELEGRAM_CHAT_ID=chat-id-autorizado SEED_OCTOBER_TARGET_PRICE=280000 SEED_DECEMBER_TARGET_PRICE=230000 npm run seed
ENABLED_FLIGHT_PROVIDERS=AEROLINEAS_ARGENTINAS npm run watch:once
```

El watcher respeta `providerCode` por búsqueda. Si una búsqueda pide `AEROLINEAS_ARGENTINAS` pero `ENABLED_FLIGHT_PROVIDERS` no lo incluye, esa búsqueda se saltea con un warning.

Las notificaciones se consolidan por `FlightWatchRun`: si una misma corrida genera `LOWEST_HISTORICAL_PRICE`, `PRICE_DROP_CHEAPEST`, `PRICE_DROP_RECOMMENDED`, `TARGET_PRICE_REACHED` y `DAILY_SUMMARY`, se envía un solo mensaje con los eventos importantes arriba y el resumen debajo. Si sólo hay `DAILY_SUMMARY`, se envía el resumen normal.

El resumen diario incluye nombre, ruta, fechas, vuelos válidos por tramo, combinaciones evaluadas, precio total más barato, opción recomendada, desglose ida/vuelta cuando existe, tarifas disponibles por vuelo y filtros aplicados. `MAX_LEG_OPTIONS_IN_ALERT=3` limita cuántos vuelos por tramo se muestran para evitar mensajes gigantes. Si hay más, el mensaje agrega `Hay N vuelos válidos más no mostrados`.

Para verificar snapshots:

```bash
docker exec -it flight-price-watcher-mongo mongosh flight-price-watcher
db.flight_price_snapshots.find({}).sort({ capturedAt: -1 }).limit(10).pretty()
```

Esta colección sólo recibe nuevos documentos si `PERSIST_PRICE_SNAPSHOTS=true`. El histórico compacto principal vive en `flight_watch_runs`.

Para verificar alertas:

```bash
docker exec -it flight-price-watcher-mongo mongosh flight-price-watcher
db.flight_alerts.find({}).sort({ createdAt: -1 }).limit(10).pretty()
```

## Diagnóstico de Aerolíneas

Para probar Aerolíneas contra la API real sin cron, Mongo, snapshots, alertas ni notificaciones:

```bash
ORIGIN=AEP DESTINATION=MDZ DEPARTURE_DATE=2026-07-15 TRIP_TYPE=ONE_WAY npm run aerolineas:test
```

El comando imprime:

- query params generados, sin token
- resumen con candidatos crudos, vuelos válidos por tramo, combinaciones válidas y descartes por aeropuerto, escalas, fecha o precio faltante
- precio mínimo
- moneda
- vuelos válidos de ida y vuelta con ruta, horarios, tarifa más barata, otras tarifas y marcas `cheapest` / `recommended`
- combinaciones calculadas con desglose ida/vuelta y total
- opciones descartadas con motivo resumido para comparar contra la web
- errores claros para token, `401`, `403`, timeout o respuesta inesperada

Ejemplo ida:

```bash
ORIGIN=AEP DESTINATION=MDZ DEPARTURE_DATE=2026-07-15 TRIP_TYPE=ONE_WAY npm run aerolineas:test
```

Ejemplo ida y vuelta:

```bash
ORIGIN=JUJ DESTINATION=AEP DEPARTURE_DATE=2026-10-10 RETURN_DATE=2026-10-15 TRIP_TYPE=ROUND_TRIP npm run aerolineas:test
```

También acepta:

```bash
ADULTS=1 CHILDREN=0 INFANTS=0 CABIN_CLASS=ECONOMY
```

Si `ROUND_TRIP` falla, no se debe ajustar a ciegas: conservar la query generada, status code y body del error para revisar el contrato real de la API.

El filtrado de Aerolíneas es estricto:

- `ONE_WAY`: solo acepta vuelo directo `ORIGIN -> DESTINATION`.
- `ROUND_TRIP`: solo acepta ida directa `ORIGIN -> DESTINATION` y vuelta directa `DESTINATION -> ORIGIN`.
- Resultados que lleguen a otro aeropuerto, por ejemplo `EZE` cuando se pidió `AEP`, se descartan.
- Resultados con escalas se descartan.
- Los vuelos válidos se agrupan por `flightNumber + origin + destination + departureDateTime + arrivalDateTime`. Dentro de cada vuelo se guardan las tarifas disponibles y el ranking usa `cheapestPrice`.
- Las combinaciones válidas se ordenan por precio ascendente y luego se rankean. La recomendada evita salidas antes de las `07:00` o después de las `22:00` cuando existe otra opción razonable.

Limitaciones y riesgos:

- La API usada es interna/no oficial y puede cambiar sin aviso.
- El token público puede cambiar de ubicación o mecanismo.
- El endpoint puede bloquear por headers, rate limits o reglas anti-bot.
- El mapper puede devolver varias opciones; el watcher guarda un snapshot por quote devuelta.
- Para ida y vuelta, el mapper combina candidatos directos de ida y vuelta por precio. Si la API aplica reglas de combinabilidad de tarifas más estrictas, habrá que modelarlas.
- Ida y vuelta se construye con dos `leg` según el bundle público de la web, pero el fixture local cubre solo ida.
- El sistema no hace compra ni reserva; solo lectura de ofertas.

## Tests

```bash
npm test
npm run build
```

## Arquitectura

La app sigue una Clean Architecture pragmática:

- `domain`: entidades, enums, puertos e interfaces.
- `application`: casos de uso y servicios orquestadores.
- `infrastructure`: Mongoose, providers concretos y canales de notificación.

Módulos incluidos:

- `flight-searches`: búsquedas configuradas por el usuario.
- `flight-prices`: snapshots históricos de precios.
- `flight-watch-runs`: resumen compacto de cada ejecución por búsqueda/provider.
- `flight-alerts`: comparación, alertas y deduplicación diaria.
- `flight-providers`: registry y `FakeFlightProvider`.
- `flight-providers`: registry, `FakeFlightProvider` y `AerolineasArgentinasProvider` opcional.
- `notifications`: `ConsoleNotificationChannel` y `TelegramNotificationChannel`.
- `scheduler`: cron diario que ejecuta el flujo.
- `seed`: creación de datos iniciales.

El core no depende de Aerolíneas Argentinas, Flybondi, JetSmart, MongoDB ni Telegram. Las aerolíneas futuras deben implementar `FlightProviderPort` y registrarse en `FlightProvidersModule`.

## Flujo del MVP

1. El seed crea una o más `FlightSearch` activas.
2. El cron o `npm run watch:once` obtiene las búsquedas activas.
3. Por cada búsqueda, consulta los providers registrados.
4. `FakeFlightProvider` devuelve precios simulados.
5. Se guarda un `FlightWatchRun` compacto con estado `SUCCESS`, `NO_RESULTS` o `FAILED`.
6. Si `PERSIST_PRICE_SNAPSHOTS=true`, se guarda además un `FlightPriceSnapshot` por quote; por defecto está desactivado.
7. Se evalúan alertas usando `FlightWatchRun` como fuente principal, comparando contra runs exitosos anteriores:
   - `PRICE_DROP_CHEAPEST`
   - `PRICE_DROP_RECOMMENDED`
   - `TARGET_PRICE_REACHED`
   - `LOWEST_HISTORICAL_PRICE`
   - `DAILY_SUMMARY` si `notifyAlways = true`
8. Se deduplican alertas por `searchId + providerCode + alertType + fecha`.
9. Se notifica por consola y, si está configurado, por Telegram.

## Modelo FlightWatchRun

`FlightWatchRun` representa una ejecución del watcher para una búsqueda y un provider. Se guarda en `flight_watch_runs` y es la persistencia principal del watcher.

Shape resumido:

```ts
{
  searchId,
  providerCode,
  ranAt,
  status: 'SUCCESS' | 'NO_RESULTS' | 'FAILED',
  route,
  departureDate,
  returnDate,
  validOptionsCount,
  currency,
  cheapestPrice,
  recommendedPrice,
  cheapestOption,
  recommendedOption,
  topOptions,
  cheapestOptionCount,
  diagnosticsSummary,
  diagnosticsDetails,
  alertsGenerated
}
```

`topOptions` guarda sólo datos compactos: precio, moneda, tarifa, asientos, resumen de ida/vuelta, horarios, tags y si tiene escalas.

`diagnosticsSummary` se guarda siempre que el provider lo informe, con este shape compacto:

```ts
{
  rawCandidates,
  discardedByAirport,
  discardedByStops,
  discardedByDate,
  discardedByMissingPrice,
  validCandidates
}
```

`diagnosticsDetails` es opcional y sólo se guarda si `PERSIST_PROVIDER_DIAGNOSTICS=true`:

```ts
{
  discardedReasons: string[]
}
```

No se guardan payloads crudos del provider en `FlightWatchRun`.

Las alertas de caída de precio y mínimo histórico ya no comparan snapshots individuales. `PRICE_DROP_CHEAPEST`, `PRICE_DROP_RECOMMENDED` y `LOWEST_HISTORICAL_PRICE` usan `cheapestPrice` y `recommendedPrice` de `FlightWatchRun`; `FlightPriceSnapshot` se conserva por compatibilidad e histórico fino opcional, controlado por `PERSIST_PRICE_SNAPSHOTS`.

Índices:

- `searchId + providerCode + ranAt`
- `searchId + providerCode + createdAt`
- `status`

## Supuestos

- No hay scraping real en esta fase.
- No hay controllers REST ni autenticación.
- La moneda se guarda como dato de la búsqueda y del snapshot; no hay conversión cambiaria.
- La deduplicación diaria usa fecha UTC (`YYYY-MM-DD`).
- `FakeFlightProvider` genera precios determinísticos por ruta y día para facilitar pruebas manuales.
- Los escenarios manuales del fake provider se configuran con `FAKE_PROVIDER_SCENARIO`.
- `AerolineasArgentinasProvider` usa una API interna no oficial; debe tratarse como integración frágil.

## Próximos pasos

- Agregar controllers REST para administrar búsquedas.
- Agregar más seeds o comandos CLI.
- Implementar providers reales detrás de `FlightProviderPort`.
- Fortalecer `AerolineasArgentinasProvider` con fixtures de ida y vuelta y observabilidad de errores.
- Persistir errores de providers y métricas de ejecución.
- Mejorar reglas de alerta con umbrales configurables.
- Agregar integración real o e2e con MongoDB de test.
