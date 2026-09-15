import prisma from "../db.server";
import { MOCK_PICKUP_POINTS } from "./pickupPoints.mock";
import { geocodeOrigin, haversineKm } from "./geo.server";

export interface PickupPoint {
  id: string;
  name: string;
  carrier: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
  };
  lat: number;
  lng: number;
  openingHours: string[];
  phone?: string;
  /**
   * Distancia en kilómetros a la dirección del cliente (`postalCode`/
   * `city` en GetPickupPointsParams). Solo se rellena cuando esa
   * dirección se ha podido geolocalizar; si no, queda `undefined` y el
   * punto no participa en el orden por distancia.
   */
  distanceKm?: number;
}

interface GetPickupPointsParams {
  shop?: string;
  /** Código postal de la dirección del cliente (no del punto de recogida). */
  postalCode?: string;
  /** Ciudad de la dirección del cliente, si no se conoce el código postal. */
  city?: string;
  country?: string;
}

/**
 * Punto único de integración con el servicio web de la agencia de
 * transporte.
 *
 * Hoy ese servicio no existe todavía, así que cuando no hay ninguna URL
 * configurada (ni en los ajustes de la tienda ni en la variable de entorno
 * PICKUP_POINTS_API_URL) se devuelve un listado de demostración fijo
 * (ver ./pickupPoints.mock.ts) para poder desarrollar y probar todo el
 * flujo — bloque de carrito, vista de lista, vista de mapa y guardado del
 * punto elegido como atributo del pedido.
 *
 * En cuanto el servicio real esté disponible, basta con:
 *   1. Configurar su URL (y API key si aplica) desde el panel de ajustes
 *      de la app en el Admin de Shopify, o mediante las variables de
 *      entorno PICKUP_POINTS_API_URL / PICKUP_POINTS_API_KEY.
 *   2. Ajustar `normalizeExternalResponse` de abajo para que traduzca el
 *      contrato real del servicio a la forma `PickupPoint` de arriba.
 * No hace falta tocar nada del bloque de carrito ni del proxy: ambos
 * consumen siempre esta función.
 *
 * Distancia y orden: si `params.postalCode`/`params.city` (la dirección
 * del cliente) se puede geolocalizar — ver ./geo.server.ts —, se calcula
 * la distancia en línea recta de cada punto a esa dirección y el listado
 * se devuelve ordenado de menor a mayor distancia. Muchos servicios de
 * agencias de transporte ya devuelven los puntos ordenados por cercanía;
 * si el servicio externo incluye su propia distancia (ver
 * `normalizeExternalResponse`) se respeta esa; si no, se calcula aquí.
 */
export async function getPickupPoints(
  params: GetPickupPointsParams,
): Promise<PickupPoint[]> {
  const shopSettings = params.shop
    ? await prisma.shopSettings.findUnique({ where: { shop: params.shop } })
    : null;

  const apiUrl = shopSettings?.pickupApiUrl || process.env.PICKUP_POINTS_API_URL;
  const apiKey = shopSettings?.pickupApiKey || process.env.PICKUP_POINTS_API_KEY;

  let points: PickupPoint[];

  if (apiUrl) {
    try {
      points = await fetchFromExternalService(apiUrl, apiKey, params);
    } catch (error) {
      // Nunca dejamos el carrito sin puntos por un fallo del servicio
      // externo: se registra el error y se cae al listado de demo.
      console.error("[pickupPoints] Error consultando el servicio externo:", error);
      points = filterMockPoints(params);
    }
  } else {
    points = filterMockPoints(params);
  }

  return attachDistancesAndSort(points, params);
}

async function attachDistancesAndSort(
  points: PickupPoint[],
  params: GetPickupPointsParams,
): Promise<PickupPoint[]> {
  const origin = await geocodeOrigin({ postalCode: params.postalCode, city: params.city });
  if (!origin) return points;

  const withDistance = points.map((point) => ({
    ...point,
    distanceKm: point.distanceKm ?? haversineKm(origin, { lat: point.lat, lng: point.lng }),
  }));

  return withDistance.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

async function fetchFromExternalService(
  apiUrl: string,
  apiKey: string | undefined,
  params: GetPickupPointsParams,
): Promise<PickupPoint[]> {
  const url = new URL(apiUrl);
  if (params.postalCode) url.searchParams.set("postalCode", params.postalCode);
  if (params.city) url.searchParams.set("city", params.city);
  if (params.country) url.searchParams.set("country", params.country);

  const response = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`El servicio externo respondió ${response.status}`);
  }

  const data = await response.json();
  return normalizeExternalResponse(data);
}

/**
 * TODO: cuando se conozca el contrato real del servicio web de la agencia
 * de transporte, ajustar este mapeo. De momento acepta tanto un array
 * plano como `{ points: [...] }` / `{ results: [...] }`, y admite nombres
 * de campo en inglés o en español (name/nombre, lat/latitud, etc.) como
 * punto de partida razonable.
 */
function normalizeExternalResponse(data: unknown): PickupPoint[] {
  const raw = Array.isArray(data)
    ? data
    : ((data as any)?.points ?? (data as any)?.results ?? []);

  return raw.map((p: any): PickupPoint => ({
    id: String(p.id ?? p.code ?? p.codigo ?? crypto.randomUUID()),
    name: p.name ?? p.nombre ?? "Punto de recogida",
    carrier: p.carrier ?? p.agencia ?? "",
    address: {
      line1: p.address?.line1 ?? p.direccion ?? "",
      line2: p.address?.line2 ?? p.direccion2 ?? undefined,
      city: p.address?.city ?? p.poblacion ?? p.ciudad ?? "",
      province: p.address?.province ?? p.provincia ?? "",
      postalCode: p.address?.postalCode ?? p.cp ?? p.codigoPostal ?? "",
      countryCode: p.address?.countryCode ?? p.pais ?? "ES",
    },
    lat: Number(p.lat ?? p.latitude ?? p.latitud),
    lng: Number(p.lng ?? p.lon ?? p.longitude ?? p.longitud),
    openingHours: p.openingHours ?? p.horario ?? [],
    phone: p.phone ?? p.telefono,
    // Si el servicio real ya calcula la distancia a la dirección
    // enviada, se respeta y no se recalcula (ver attachDistancesAndSort).
    distanceKm:
      p.distanceKm ?? p.distancia ?? p.distance ?? undefined,
  }));
}

/**
 * `params.postalCode`/`params.city` son la dirección del CLIENTE, no la
 * del punto de recogida — no sirven para filtrar qué puntos existen, solo
 * para calcular distancias en `attachDistancesAndSort`. Así que aquí
 * simplemente se devuelve todo el listado de demo.
 */
function filterMockPoints(_params: GetPickupPointsParams): PickupPoint[] {
  return MOCK_PICKUP_POINTS;
}
