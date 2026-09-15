import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { getPickupPoints } from "../services/pickupPoints.server";

/**
 * Endpoint público consumido por el bloque de carrito (theme app
 * extension) a través del App Proxy configurado en shopify.app.toml:
 *
 *   https://<tienda>.myshopify.com/apps/pickup-points/points
 *     -> reenviado por Shopify a esta ruta, firmado con un HMAC que
 *        `authenticate.public.appProxy` verifica.
 *
 * Al ser App Proxy, la petición desde el storefront es del mismo origen
 * (el dominio de la propia tienda), así que no hace falta configurar CORS.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const postalCode = url.searchParams.get("postalCode") ?? undefined;
  const city = url.searchParams.get("city") ?? undefined;
  const country = url.searchParams.get("country") ?? undefined;
  const shop = session?.shop ?? url.searchParams.get("shop") ?? undefined;

  const points = await getPickupPoints({ shop, postalCode, city, country });

  return json({ points });
}
