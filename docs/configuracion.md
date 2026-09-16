# Configuración actual — Selector de punto de recogida

Documento de referencia: qué se puede configurar hoy en este proyecto, con qué valor
está cada cosa ahora mismo, y **dónde hay que ir** para cambiarla — porque no todo se
edita en el mismo sitio: hay ficheros de código, variables de entorno, una pantalla
del Admin de Shopify y el propio editor de temas.

Generado a partir de una lectura del repositorio a fecha de 15 de septiembre de 2026
(commits `cc51afe` y `5978c98`). No refleja ningún valor real relleno en producción —
hoy todos los placeholders siguen sin sustituir (ver [§7](#7-vínculo-del-cli-con-partners-y-la-tienda-shopifyprojectjson)).

## Mapa rápido: qué se edita dónde

| Configuración | Dónde se edita | Quién la toca |
|---|---|---|
| Credenciales de la app Shopify, URLs, scopes, webhooks, App Proxy | Fichero [`shopify.app.test-plugin.toml`](../shopify.app.test-plugin.toml) | Desarrollador, con `shopify app deploy` para publicar |
| Secretos y conexión del backend (claves, BD, servicio externo) | Variables de entorno del servidor (`web/.env` en local, panel del hosting en producción) | Quien despliega el backend |
| URL/credenciales del servicio de puntos **por tienda instalada** | Admin de Shopify → app → pantalla de ajustes | Cada comercio que instala la app |
| Vista inicial por defecto **por tienda** | Mismo sitio que la anterior | Cada comercio |
| Textos, colores y comportamiento del bloque de carrito | Editor de temas de Shopify → bloque "Punto de recogida" | Cada comercio, por tema |
| Esquema y conexión de la base de datos | [`web/prisma/schema.prisma`](../web/prisma/schema.prisma) + variables de entorno | Desarrollador |
| Build/despliegue en Render | [`render.yaml`](../render.yaml) | Desarrollador |
| Vínculo del CLI con Partners y la tienda de desarrollo | [`.shopify/project.json`](../.shopify/project.json) (generado solo) | El CLI, no se edita a mano |

---

## 1. Config de la app en Shopify — `shopify.app.test-plugin.toml`

Es el **único** fichero de configuración de la app activo (sustituye a un
`shopify.app.toml` manual que ya no se usa). Se edita a mano para los datos fijos, y
el propio CLI rellena `application_url`/`redirect_urls`/`app_proxy.url` en cada
`shopify app dev`. Los cambios no llegan a Shopify hasta ejecutar `npm run deploy`.

| Clave | Valor actual | Qué controla |
|---|---|---|
| `client_id` | `0249018a05a22cbdb144d9ffc8542599` | Identifica la app en la organización Datadec S.A. de Partners. |
| `application_url` | `https://REPLACE-WITH-RENDER-URL.onrender.com` | URL pública del backend — placeholder sin sustituir. |
| `embedded` | `true` | La app se abre dentro del iframe del Admin, no en pestaña aparte. |
| `name` | `Selector de punto de recogida` | Nombre visible en Partners y en el Admin. |
| `access_scopes.scopes` | *(vacío)* | El MVP no lee ni escribe datos de la tienda a propósito. |
| `auth.redirect_urls` | 3 URLs, todas con el placeholder | Callbacks de OAuth permitidos. |
| `webhooks.api_version` | `2026-10` | Versión de la API de Shopify para webhooks. |
| `webhooks.subscriptions` | `app/uninstalled` → `/webhooks/app/uninstalled` | Único webhook suscrito hoy. |
| `app_proxy.url` / `.subpath` / `.prefix` | placeholder / `pickup-points` / `apps` | Arma la URL pública `.../apps/pickup-points/*` que consume el bloque de carrito. |
| `build.automatically_update_urls_on_dev` | `true` | El CLI reescribe las URLs de arriba en cada `shopify app dev`. |
| `pos.embedded` | `false` | No hay integración con el POS. |

Los **tres placeholders `REPLACE-WITH-RENDER-URL`** (`application_url`, los 3
`redirect_urls`, `app_proxy.url`) son el primer bloqueo detectado en el informe de
arquitectura: hay que sustituirlos por la URL pública real del backend antes de
`shopify app deploy`.

## 2. Variables de entorno del backend

Definidas en [`web/.env.example`](../web/.env.example) (plantilla) y
[`web/.env`](../web/.env) (valores locales, no versionado). En producción se
rellenan en el panel del hosting — hoy [`render.yaml`](../render.yaml) las declara
como `sync: false`, es decir, Render las pide pero no las genera solas.

| Variable | Para qué sirve | Valor local hoy |
|---|---|---|
| `SHOPIFY_API_KEY` | Identifica la app ante Shopify (API pública) | vacío — lo rellena `shopify app dev`/`config link` |
| `SHOPIFY_API_SECRET` | Secreto de la app (firma OAuth) | vacío |
| `SCOPES` | Scopes de OAuth a pedir en la instalación | vacío (coincide con `access_scopes` del `.toml`) |
| `SHOPIFY_APP_URL` | URL pública que usa el propio backend para construirse enlaces | vacío |
| `DATABASE_URL` | Conexión (con pooler) que usa la app en marcha | `file:dev.sqlite` en local; en producción, la cadena de Neon |
| `DIRECT_DATABASE_URL` | Conexión directa (sin pooler), la usa `prisma migrate` | vacío en local (SQLite no la necesita) |
| `PICKUP_POINTS_API_URL` | URL del servicio real de puntos de recogida, **valor por defecto para todas las tiendas** | vacío → se sirve el listado DEMO |
| `PICKUP_POINTS_API_KEY` | Cabecera `Authorization: Bearer …` para esa URL | vacío |

Nota: `PICKUP_POINTS_API_URL`/`_API_KEY` son el valor **por defecto**. Si una tienda
instalada rellena su propia URL en el panel de ajustes (§4), ese valor gana sobre la
variable de entorno — ver [`pickupPoints.server.ts:74-75`](../web/app/services/pickupPoints.server.ts#L74-L75).

## 3. Base de datos — `web/prisma/schema.prisma`

| Campo | Valor | Detalle |
|---|---|---|
| `datasource.provider` | `postgresql` | Pensado para Neon; ver conversación sobre alternativas (SQLite) si se despliega en infraestructura propia. |
| `datasource.url` | `env("DATABASE_URL")` | Conexión agrupada (pooler), la que usa la app en marcha. |
| `datasource.directUrl` | `env("DIRECT_DATABASE_URL")` | Conexión directa, solo la usa `prisma migrate`. |

Dos tablas, ambas configuración **de estado**, no de puntos de recogida:

- **`Session`** — token OAuth de cada tienda instalada (obligatoria mientras exista
  Admin embebido con `authenticate.admin`). No se edita a mano nunca; la escribe la
  librería `@shopify/shopify-app-session-storage-prisma`.
- **`ShopSettings`** — una fila por tienda instalada, con los campos que cada
  comercio rellena en la pantalla de ajustes (§4): `pickupApiUrl`, `pickupApiKey`,
  `defaultView`.

**Estado real hoy:** `web/prisma/migrations` solo tiene el `migration_lock.toml` —
la migración inicial (`npx prisma migrate dev --name init`) nunca se ha generado.

## 4. Ajustes por tienda — pantalla del Admin de Shopify

**Página:** dentro del Admin de cada tienda que instale la app → apartado de la app
("Selector de punto de recogida"). Implementada en
[`web/app/routes/app._index.tsx`](../web/app/routes/app._index.tsx); el formulario
concreto está en las líneas [92-118](../web/app/routes/app._index.tsx#L92-L118).

| Campo del formulario | Guarda en (`ShopSettings`) | Valor por defecto si se deja vacío |
|---|---|---|
| URL del servicio web | `pickupApiUrl` | usa `PICKUP_POINTS_API_URL` del entorno |
| API key (opcional) | `pickupApiKey` | usa `PICKUP_POINTS_API_KEY` del entorno |
| Vista inicial por defecto (Lista / Mapa) | `defaultView` | `"list"` |

Esta pantalla es **distinta por cada tienda instalada** — es la pieza que permite que
dos comercios usen dos transportistas diferentes sin tocar código ni variables de
entorno compartidas.

## 5. Ajustes del bloque de carrito — editor de temas

**Página:** en cada tienda, Admin → *Tienda online → Temas → Personalizar* → plantilla
**Carrito** → bloque de aplicación **"Punto de recogida"**. Esquema declarado en
[`extensions/pickup-point-picker/blocks/pickup-point-picker.liquid`](../extensions/pickup-point-picker/blocks/pickup-point-picker.liquid#L63-L161).

A diferencia de §4, esto no vive en la base de datos: cada bloque guarda sus valores
en la configuración del propio tema (JSON de secciones de Shopify), así que puede
haber ajustes distintos por tema o incluso por plantilla si el bloque se repite.

| Grupo | Ajuste (`id`) | Etiqueta en el editor | Valor por defecto |
|---|---|---|---|
| Textos | `label` | Etiqueta del campo | "Punto de recogida" |
| | `placeholder` | Texto cuando no hay selección | "Selecciona un punto de recogida" |
| | `modal_title` | Título del selector | "Elige tu punto de recogida" |
| | `cta_label` | Texto del botón de confirmación | "Confirmar punto de recogida" |
| | `list_tab_label` | Texto de la pestaña de lista | "Lista" |
| | `map_tab_label` | Texto de la pestaña de mapa | "Mapa" |
| | `search_placeholder` | Texto del buscador | "Tu código postal o ciudad" |
| | `distance_label` | Formato de la distancia (usa `{km}`) | "a {km} km" |
| | `error_message` | Mensaje de error al cargar los puntos | "No se han podido cargar los puntos de recogida. Inténtalo de nuevo." |
| Comportamiento | `default_view` | Vista inicial (Lista / Mapa) | "list" |
| | `cart_attribute_name` | Nombre del atributo del pedido | "Punto de recogida" |
| Estilo | `accent_color` | Color de acento | `#1a1a1a` |

Nota: no hay ficheros en `extensions/pickup-point-picker/locales/` (carpeta vacía) —
no hay traducción automática por idioma de la tienda; todos los textos son estos
valores por defecto en español, que cada comercio puede sobrescribir a mano desde
este mismo editor.

## 6. Despliegue en Render — `render.yaml`

Solo aplica si se despliega en Render (blueprint); en infraestructura propia esto no
se usa, pero enumera exactamente qué variables hay que rellenar a mano en cualquier
hosting.

| Clave | Valor | Nota |
|---|---|---|
| `rootDir` | `web` | El build corre dentro de `web/`. |
| `buildCommand` | `npm install && npx prisma generate && npx prisma migrate deploy && npm run build` | Aplica migraciones pendientes en cada despliegue. |
| `startCommand` | `npm run start` | `remix-serve ./build/server/index.js` |
| `NODE_VERSION` | `20.17.0` | Fijada en el blueprint. |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL`, `DATABASE_URL`, `DIRECT_DATABASE_URL`, `PICKUP_POINTS_API_URL`, `PICKUP_POINTS_API_KEY` | `sync: false` | Render las pide en el primer despliegue; no genera ningún valor sola. |

## 7. Vínculo del CLI con Partners y la tienda — `.shopify/project.json`

No se edita a mano: lo escribe `shopify app config link` / `shopify app dev`.

```json
{ "0249018a05a22cbdb144d9ffc8542599": { "dev_store_url": "datadec-dev-pickup.myshopify.com" } }
```

Confirma que el proyecto ya se vinculó una vez a la organización Datadec S.A. en
Partners y a la tienda de desarrollo `datadec-dev-pickup.myshopify.com`.

## 8. Comandos de configuración — `package.json` (raíz)

Definidos en [`package.json:7-15`](../package.json#L7-L15); son atajos sobre el
Shopify CLI, no guardan configuración por sí mismos:

| Comando | Qué hace |
|---|---|
| `npm run config:link` | Vincula la carpeta a una app de Partners (rellena `client_id`/`application_url`). |
| `npm run config:use` | Cambia entre configuraciones si hubiera más de un `shopify.app.*.toml`. |
| `npm run dev` | `shopify app dev` — túnel local + instalación en la tienda de desarrollo. |
| `npm run deploy` | `shopify app deploy` — publica el `.toml` actual en Shopify. |
| `npm run info` | `shopify app info` — vuelca la configuración activa por consola. |

---

### Lo que falta para que estos valores dejen de ser placeholders

Ya se detalla con fichas propias en el informe de arquitectura
([`docs/arquitectura.html`](arquitectura.html), página 3): migración inicial de
Prisma sin generar, backend sin desplegar (placeholders de Render en el `.toml`), y
servicio real de la agencia de transporte sin contratar. Este documento describe la
forma de la configuración, no su estado — para el estado, ver ese informe.
