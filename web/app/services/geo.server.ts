export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Distancia entre dos coordenadas en kilómetros (fórmula de Haversine,
 * distancia en línea recta — no de carretera).
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  var R = 6371; // radio medio de la Tierra en km
  var dLat = toRad(b.lat - a.lat);
  var dLng = toRad(b.lng - a.lng);
  var lat1 = toRad(a.lat);
  var lat2 = toRad(b.lat);

  var h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return R * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Centroide aproximado de cada provincia española, indexado por los dos
 * primeros dígitos del código postal. Sirve como geocodificador de
 * DEMOSTRACIÓN: basta con que el cliente escriba un CP o una ciudad para
 * poder calcular una distancia aproximada, sin depender de ningún
 * servicio externo.
 *
 * TODO: en cuanto haya un servicio real (el de la propia agencia de
 * transporte, o uno de geocodificación general), sustituir
 * `mockGeocode` por una llamada a ese servicio en `geocodeOrigin` — el
 * resto de la app (orden por distancia, badge "X,X km") no cambia.
 */
const MOCK_POSTAL_CENTROIDS: Record<string, LatLng & { city: string }> = {
  "01": { city: "Vitoria-Gasteiz", lat: 42.8467, lng: -2.6716 },
  "02": { city: "Albacete", lat: 38.9943, lng: -1.8585 },
  "03": { city: "Alicante", lat: 38.3452, lng: -0.481 },
  "04": { city: "Almería", lat: 36.8381, lng: -2.4597 },
  "05": { city: "Ávila", lat: 40.6566, lng: -4.6818 },
  "06": { city: "Badajoz", lat: 38.8794, lng: -6.9707 },
  "07": { city: "Palma", lat: 39.5696, lng: 2.6502 },
  "08": { city: "Barcelona", lat: 41.3851, lng: 2.1734 },
  "09": { city: "Burgos", lat: 42.3439, lng: -3.6969 },
  "10": { city: "Cáceres", lat: 39.4753, lng: -6.3724 },
  "11": { city: "Cádiz", lat: 36.5164, lng: -6.2993 },
  "12": { city: "Castellón de la Plana", lat: 39.9864, lng: -0.0513 },
  "13": { city: "Ciudad Real", lat: 38.9848, lng: -3.9272 },
  "14": { city: "Córdoba", lat: 37.8882, lng: -4.7794 },
  "15": { city: "A Coruña", lat: 43.3623, lng: -8.4115 },
  "16": { city: "Cuenca", lat: 40.0704, lng: -2.1374 },
  "17": { city: "Girona", lat: 41.9794, lng: 2.8214 },
  "18": { city: "Granada", lat: 37.1773, lng: -3.5986 },
  "19": { city: "Guadalajara", lat: 40.6333, lng: -3.1669 },
  "20": { city: "San Sebastián", lat: 43.3183, lng: -1.9812 },
  "21": { city: "Huelva", lat: 37.2614, lng: -6.9447 },
  "22": { city: "Huesca", lat: 42.1401, lng: -0.4089 },
  "23": { city: "Jaén", lat: 37.7796, lng: -3.7849 },
  "24": { city: "León", lat: 42.5987, lng: -5.5671 },
  "25": { city: "Lleida", lat: 41.6176, lng: 0.62 },
  "26": { city: "Logroño", lat: 42.4627, lng: -2.4449 },
  "27": { city: "Lugo", lat: 43.0121, lng: -7.556 },
  "28": { city: "Madrid", lat: 40.4168, lng: -3.7038 },
  "29": { city: "Málaga", lat: 36.7213, lng: -4.4214 },
  "30": { city: "Murcia", lat: 37.9922, lng: -1.1307 },
  "31": { city: "Pamplona", lat: 42.8125, lng: -1.6458 },
  "32": { city: "Ourense", lat: 42.3358, lng: -7.8639 },
  "33": { city: "Oviedo", lat: 43.3603, lng: -5.8448 },
  "34": { city: "Palencia", lat: 42.0096, lng: -4.5288 },
  "35": { city: "Las Palmas de Gran Canaria", lat: 28.1235, lng: -15.4363 },
  "36": { city: "Pontevedra", lat: 42.431, lng: -8.6444 },
  "37": { city: "Salamanca", lat: 40.9701, lng: -5.6635 },
  "38": { city: "Santa Cruz de Tenerife", lat: 28.4636, lng: -16.2518 },
  "39": { city: "Santander", lat: 43.4623, lng: -3.81 },
  "40": { city: "Segovia", lat: 40.9429, lng: -4.1088 },
  "41": { city: "Sevilla", lat: 37.3891, lng: -5.9845 },
  "42": { city: "Soria", lat: 41.7636, lng: -2.4649 },
  "43": { city: "Tarragona", lat: 41.1189, lng: 1.2445 },
  "44": { city: "Teruel", lat: 40.3456, lng: -1.1065 },
  "45": { city: "Toledo", lat: 39.8628, lng: -4.0273 },
  "46": { city: "Valencia", lat: 39.4699, lng: -0.3763 },
  "47": { city: "Valladolid", lat: 41.6523, lng: -4.7245 },
  "48": { city: "Bilbao", lat: 43.263, lng: -2.935 },
  "49": { city: "Zamora", lat: 41.5033, lng: -5.7446 },
  "50": { city: "Zaragoza", lat: 41.6488, lng: -0.8891 },
  "51": { city: "Ceuta", lat: 35.8894, lng: -5.3213 },
  "52": { city: "Melilla", lat: 35.2923, lng: -2.9381 },
};

/**
 * Geocodificador de DEMOSTRACIÓN: acepta un código postal español (usa
 * los dos primeros dígitos, la provincia) o el nombre de una capital de
 * provincia, y devuelve unas coordenadas aproximadas. Devuelve `null`
 * si no reconoce la consulta.
 */
export function mockGeocode(query: string): LatLng | null {
  var trimmed = query.trim();
  if (!trimmed) return null;

  var postalMatch = trimmed.match(/^\d{2}/);
  if (postalMatch) {
    var entry = MOCK_POSTAL_CENTROIDS[postalMatch[0]];
    return entry ? { lat: entry.lat, lng: entry.lng } : null;
  }

  var normalized = trimmed.toLowerCase();
  var byName = Object.values(MOCK_POSTAL_CENTROIDS).find((entry) =>
    entry.city.toLowerCase().includes(normalized),
  );

  return byName ? { lat: byName.lat, lng: byName.lng } : null;
}

/**
 * Punto único de resolución del origen (dirección del cliente) a
 * coordenadas. Hoy usa `mockGeocode`; cuando haya un servicio de
 * geocodificación real (o el propio servicio de la agencia de
 * transporte devuelva ya distancia/orden), basta con cambiar esta
 * función.
 */
export async function geocodeOrigin(params: {
  postalCode?: string;
  city?: string;
}): Promise<LatLng | null> {
  if (params.postalCode) {
    var byPostal = mockGeocode(params.postalCode);
    if (byPostal) return byPostal;
  }
  if (params.city) {
    return mockGeocode(params.city);
  }
  return null;
}
