import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { getPickupPoints } from "../services/pickupPoints.server";

/**
 * Endpoint que consume la Checkout UI Extension (`extensions/pickup-point-checkout`).
 *
 * A diferencia del bloque de carrito (que usa el App Proxy, mismo origen
 * que la tienda), una extensión de checkout corre en el dominio de
 * Shopify y llama a este backend directamente por red — por eso hace
 * falta CORS, y por eso la autenticación es la de sesión de checkout
 * (`authenticate.public.checkout`, verifica el token firmado que envía
 * la propia extensión como `Authorization: Bearer <token>`), no la
 * firma del App Proxy. El helper `cors` que devuelve se encarga de
 * poner las cabeceras correctas (incluida la respuesta al preflight).
 *
 * Devuelve también `googleMapsApiKey`: la extensión de checkout no puede
 * usar Leaflet/OpenStreetMap (el sandbox de checkout no permite scripts
 * de terceros), así que la vista de mapa usa el componente nativo
 * <s-map>, que exige una API key de Google Maps. Se usa una única key
 * compartida de Datadec (variable de entorno GOOGLE_MAPS_API_KEY),
 * válida para todas las tiendas que instalen la app.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.checkout(request);

  const url = new URL(request.url);
  const postalCode = url.searchParams.get("postalCode") ?? undefined;
  const city = url.searchParams.get("city") ?? undefined;
  const country = url.searchParams.get("country") ?? undefined;
  const shop = sessionToken?.dest?.replace(/^https?:\/\//, "");

  const points = await getPickupPoints({ shop, postalCode, city, country });

  return cors(
    json({ points, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null }),
  );
}
