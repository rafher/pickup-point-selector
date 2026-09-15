# Selector de punto de recogida — app de Shopify

App de Shopify (Remix + Theme App Extension) que añade a la página del
carrito un campo para elegir un punto de recogida de paquetes de una
agencia de transporte, con dos vistas seleccionables por el comprador:
**lista** y **mapa** (Leaflet + OpenStreetMap, sin API key).

Pensada para distribuirse a terceros: cada comercio instala la app desde
su propio Admin de Shopify, la activa arrastrando un bloque en el editor
de temas, y opcionalmente configura la URL del servicio web de su propia
agencia de transporte desde un panel de ajustes.

## Cómo está montado

```
shopify.app.<nombre>.toml  Config de la app (scopes, webhooks, App Proxy).
                            El CLI la nombra según el nombre de la app en
                            Partners — hoy es shopify.app.test-plugin.toml.
render.yaml               Blueprint de despliegue en Render (ver más abajo).
web/                      Backend + admin embebido (Remix)
  app/shopify.server.ts   Setup de @shopify/shopify-app-remix (OAuth, sesiones)
  app/routes/
    _index/               Landing pública (fuera del Admin)
    auth.login/            Formulario de login manual
    auth.$.tsx             Catch-all de OAuth
    app.tsx                 Layout del admin embebido (Polaris + App Bridge)
    app._index.tsx          Ajustes: URL/API key del servicio real, vista por defecto
    proxy.points.tsx        Endpoint público que consume el bloque de carrito
    webhooks.app.uninstalled.tsx
  app/services/
    pickupPoints.server.ts  Único punto de integración con el servicio externo
    pickupPoints.mock.ts    Datos fijos de DEMO (10 puntos en España)
  prisma/schema.prisma      Sesiones OAuth + ajustes por tienda (SQLite)
extensions/pickup-point-picker/   Theme App Extension (bloque de carrito)
  blocks/pickup-point-picker.liquid
  assets/pickup-point-picker.js   Modal, vista lista, vista mapa, Cart API
  assets/pickup-point-picker.css
```

### Por qué carrito y no checkout

El campo vive en la página del **carrito**, no en el checkout nativo:
funciona en cualquier plan de Shopify (checkout extensibility con campos
personalizados requiere Shopify Plus). El punto elegido se guarda como
**atributo del pedido** (`attributes["Punto de recogida"]`, más un
`attributes["_pickup_point_id"]` interno) mediante `/cart/update.js`, y es
visible en el Admin, en el email de confirmación y por la Admin API.

### Cómo llegan los puntos al navegador (App Proxy)

El bloque de carrito nunca llama directamente al backend de la app (eso
obligaría a configurar CORS y expondría el dominio real de la app). En su
lugar usa el **App Proxy** de Shopify configurado en `shopify.app.toml`:

```
storefront: GET https://<tienda>.myshopify.com/apps/pickup-points/points
                 │
                 ▼ (mismo origen para el navegador; Shopify firma la petición)
backend:    GET https://<tu-app>/proxy/points
                 │
                 ▼
            web/app/routes/proxy.points.tsx
                 │
                 ▼
            services/pickupPoints.server.ts  ──▶  servicio real o datos DEMO
```

## Datos de demostración vs. servicio real

`app/services/pickupPoints.server.ts` es el **único** sitio que sabe de
dónde vienen los puntos de recogida:

- Si no hay ninguna URL configurada, sirve el listado fijo de
  `pickupPoints.mock.ts` (10 puntos de ejemplo repartidos por España).
  Así puedes probar el bloque, la vista de lista, la vista de mapa y el
  guardado en el carrito sin depender de nadie.
- En cuanto rellenes una URL (desde el panel de ajustes de la app en el
  Admin — tiene prioridad y es distinto por cada tienda instalada — o
  mediante las variables de entorno `PICKUP_POINTS_API_URL` /
  `PICKUP_POINTS_API_KEY`), esa función empieza a llamar al servicio real
  y a normalizar su respuesta con `normalizeExternalResponse`.

Cuando la agencia de transporte te pase el contrato real de su servicio,
solo hay que tocar `normalizeExternalResponse` (mapear sus campos a la
forma `PickupPoint`) — el bloque de carrito, el proxy y el resto de la
app no cambian.

Si el servicio externo falla (timeout, 500, etc.) se cae automáticamente
a los datos DEMO en lugar de dejar el carrito sin puntos.

### Distancia y orden

La lista se muestra siempre ordenada de menor a mayor distancia a la
dirección del cliente, con un badge "a X,X km" por punto:

- Si el cliente tiene sesión iniciada y dirección guardada, su código
  postal/ciudad (`customer.default_address`) se usa automáticamente en
  cuanto abre el selector — no tiene que escribir nada.
- Si no, el propio buscador del modal (antes solo filtraba) sirve para
  introducir un CP/ciudad y recalcular la distancia y el orden al momento.
- El cálculo es en `web/app/services/geo.server.ts`: `haversineKm`
  (distancia en línea recta) + `mockGeocode`, un geocodificador de
  DEMOSTRACIÓN con el centroide aproximado de las 52 provincias
  españolas — así funciona con cualquier CP español sin depender de
  ningún servicio externo. Si el servicio real de la agencia ya devuelve
  distancia/orden (`normalizeExternalResponse` lo detecta), se respeta esa
  antes de recalcular nada.

### Forma de un `PickupPoint`

```ts
{
  id: string;
  name: string;
  carrier: string;
  address: {
    line1: string; line2?: string;
    city: string; province: string;
    postalCode: string; countryCode: string;
  };
  lat: number;
  lng: number;
  openingHours: string[];
  phone?: string;
}
```

## Puesta en marcha

Requisitos: Node 18.20+/20.10+, cuenta de Shopify Partners y una tienda
de desarrollo (que ya tienes).

```bash
npm install                 # instala también las dependencias de web/ (workspaces)
npm run config:link         # vincula esta carpeta a una app de tu cuenta de Partners
                             # (rellena client_id/application_url en shopify.app.toml)
cp web/.env.example web/.env
cd web && npx prisma migrate dev --name init && cd ..
npm run dev                 # shopify app dev: levanta el túnel y abre la instalación en tu tienda
```

Con `shopify app dev` corriendo:

1. Instala la app en tu tienda de desarrollo cuando el CLI lo pida.
2. En el Admin de la tienda, ve a **Tienda online → Temas → Personalizar**.
3. Abre la plantilla del **Carrito**.
4. Añade el bloque de aplicación **"Punto de recogida"** (aparece en la
   sección de bloques de apps). Personaliza etiquetas, textos y color de
   acento desde el propio editor de temas.
5. Guarda y visita el carrito de la tienda: al pulsar el campo se abre el
   selector con los 10 puntos de demostración, en lista o en mapa.

El panel de ajustes de la app (dentro del Admin, sección de la app) deja
configurar la URL/API key del servicio real y la vista inicial por
defecto.

## Despliegue en Render (backend permanente)

Para desarrollo local, `shopify app dev` monta un túnel temporal (ngrok o
Cloudflare) hacia tu portátil. Eso vale para programar, pero **no** para
que clientes reales usen la app: hace falta un backend con URL pública
estable, siempre encendido. `render.yaml` deja esto casi automático:

1. Crea una base de datos Postgres gratuita en [Neon](https://neon.tech)
   (u otro proveedor) y copia su cadena de conexión.
2. Sube este repositorio a GitHub.
3. En [Render](https://render.com), **New → Blueprint**, conecta el repo
   — detecta `render.yaml` solo y preconfigura build/start.
4. Rellena las variables de entorno que te pida (no las genera él):
   `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES` (vacío), `DATABASE_URL`
   (la de Neon), `SHOPIFY_APP_URL` (la URL que te asigne el propio Render,
   tipo `https://pickup-point-selector.onrender.com` — puedes dejarla en
   blanco en el primer deploy y rellenarla en cuanto Render te la enseñe),
   y opcionalmente `PICKUP_POINTS_API_URL`/`PICKUP_POINTS_API_KEY`.
5. Al desplegar, el `buildCommand` ya ejecuta `prisma migrate deploy`
   contra esa base de datos — no hace falta hacerlo a mano.
6. Copia la URL final de Render y sustituye los tres placeholders
   `REPLACE-WITH-RENDER-URL` en `shopify.app.<nombre>.toml`
   (`application_url`, `redirect_urls` y `app_proxy.url`).
7. Publica esa configuración en Shopify:
   ```bash
   npm run deploy   # shopify app deploy
   ```

A partir de aquí ya no dependes de ningún túnel ni de la red desde la que
trabajes — el bloque de carrito habla siempre con ese backend permanente.

## Distribución a terceros

Cuando quieras que otros comercios puedan instalarla, desde el Partner
Dashboard puedes:
- Generar un **enlace de instalación** para distribución personalizada
  (compartirlo directamente con comercios concretos), o
- Enviarla a **revisión para el App Store** para distribución pública.

Antes de distribuirla de verdad conviene también:
- Revisar el scope de OAuth (`[access_scopes]` en el `.toml`): hoy está
  vacío a propósito porque el MVP no necesita leer ni escribir datos de
  la tienda.
- Traducir/ajustar los textos por defecto del bloque según el mercado; el
  merchant puede sobrescribirlos todos desde el editor de temas sin tocar
  código.

## Notas sobre este scaffold

Este proyecto se ha escrito a mano siguiendo la estructura actual de
`shopify app init` (plantilla Remix + Theme App Extension), porque el
entorno en el que se generó no tenía acceso a internet para ejecutar el
CLI ni `npm install`. Primer paso recomendado al abrirlo con conexión:

```bash
npm install
npm run -w web typecheck
```

y resolver cualquier pequeño desajuste de versión que aparezca antes de
seguir añadiendo funcionalidad.
