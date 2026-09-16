import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";

// URL del backend desplegado (ver render.yaml / README). La extensión de
// checkout no pasa por el App Proxy del storefront — llama aquí
// directamente por red (capability network_access, ver shopify.extension.toml).
const BACKEND_URL = "https://pickup-point-selector.onrender.com";

// Título exacto (sin distinguir mayúsculas) de la tarifa de envío que
// activa el selector — hoy es una tarifa de envío normal dada de alta a
// mano en Configuración → Envío y entrega. El día que se sustituya por una
// Delivery Customization Function (Fase 2 "de verdad"), esto deja de
// hacer falta: la Function podría generar la opción con un handle fijo
// y comparar por handle en vez de por título.
const PICKUP_DELIVERY_OPTION_TITLE = "puntos";

const STRINGS = {
  es: {
    heading: "Punto de recogida",
    searchLabel: "Tu código postal o ciudad",
    listTab: "Lista",
    mapTab: "Mapa",
    loading: "Cargando puntos de recogida…",
    empty: "No se han encontrado puntos de recogida.",
    error: "No se han podido cargar los puntos de recogida. Inténtalo de nuevo.",
    confirm: "Confirmar punto de recogida",
    confirming: "Guardando…",
    selected: "Seleccionado",
    saveError: "No se ha podido guardar tu selección. Inténtalo de nuevo.",
  },
  en: {
    heading: "Pickup point",
    searchLabel: "Your postal code or city",
    listTab: "List",
    mapTab: "Map",
    loading: "Loading pickup points…",
    empty: "No pickup points found.",
    error: "We couldn't load the pickup points. Please try again.",
    confirm: "Confirm pickup point",
    confirming: "Saving…",
    selected: "Selected",
    saveError: "We couldn't save your selection. Please try again.",
  },
};

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const lang = (shopify.locale?.value || "es").slice(0, 2).toLowerCase();
  const t = STRINGS[lang] || STRINGS.es;

  // Mapa por delante, ya que el sitio natural para "dónde recojo" es
  // visual — la lista sigue disponible en su pestaña.
  const [view, setView] = useState("map");
  const [query, setQuery] = useState("");
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(existingSelectionId());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(null);

  const canUpdateAttributes =
    shopify.instructions?.value?.attributes?.canUpdateAttributes !== false;

  // Se recalcula en cada render — deliveryGroups es una signal de
  // Shopify, así que leer su .value aquí hace que el componente se
  // vuelva a pintar solo en cuanto el cliente cambia de método de envío.
  //
  // NOTA: el autorrelleno del buscador con shopify.shippingAddress se
  // quitó — ese dato exige acceso de Nivel 2 a datos protegidos del
  // cliente, que hay que solicitar y esperar a que Shopify lo apruebe
  // (no es un permiso que se conceda al instante como network_access).
  // Mientras no se pida esa aprobación, el buscador es manual.
  const pickupSelected = isPickupDeliveryOptionSelected();

  useEffect(() => {
    const id = setTimeout(() => fetchPoints(query), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const selectedPoint = useMemo(
    () => points.find((p) => p.id === selectedId) || null,
    [points, selectedId],
  );

  function existingSelectionId() {
    try {
      const attrs = shopify.attributes?.value || [];
      return attrs.find((a) => a.key === "_pickup_point_id")?.value || null;
    } catch {
      return null;
    }
  }

  async function fetchPoints(currentQuery) {
    setLoading(true);
    setError(null);

    try {
      const token = await shopify.sessionToken.get();
      const url = new URL(`${BACKEND_URL}/api/checkout/points`);
      const trimmed = (currentQuery || "").trim();
      if (trimmed) {
        if (/^\d/.test(trimmed)) url.searchParams.set("postalCode", trimmed);
        else url.searchParams.set("city", trimmed);
      }

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setPoints(data.points || []);
      setGoogleMapsApiKey(data.googleMapsApiKey || null);
    } catch (err) {
      console.error("[pickup-point-checkout]", err);
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  async function confirmSelection() {
    if (!selectedPoint) return;
    setSaving(true);
    setSaveError(null);

    try {
      const summary = `${selectedPoint.name} — ${formatAddress(selectedPoint)}`;
      const r1 = await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "Punto de recogida",
        value: summary,
      });
      if (r1.type === "error") throw new Error(r1.message);

      const r2 = await shopify.applyAttributeChange({
        type: "updateAttribute",
        key: "_pickup_point_id",
        value: selectedPoint.id,
      });
      if (r2.type === "error") throw new Error(r2.message);
    } catch (err) {
      console.error("[pickup-point-checkout]", err);
      setSaveError(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  if (!canUpdateAttributes) {
    // P. ej. Apple Pay / Google Pay acelerado: no se pueden escribir
    // atributos en este contexto, así que no tiene sentido mostrar el selector.
    return null;
  }

  if (!pickupSelected) {
    // Solo se muestra cuando el cliente ha elegido la tarifa de envío de
    // recogida en punto.
    return null;
  }

  return (
    <s-stack gap="base">
      <s-heading>{t.heading}</s-heading>

      <s-text-field
        label={t.searchLabel}
        value={query}
        onInput={(event) => setQuery(event.target.value)}
      ></s-text-field>

      <s-stack direction="inline" gap="tight">
        <s-button
          variant={view === "list" ? "primary" : "secondary"}
          onClick={() => setView("list")}
        >
          {t.listTab}
        </s-button>
        <s-button
          variant={view === "map" ? "primary" : "secondary"}
          onClick={() => setView("map")}
        >
          {t.mapTab}
        </s-button>
      </s-stack>

      {loading && <s-text tone="subdued">{t.loading}</s-text>}
      {!loading && error && <s-banner tone="critical">{error}</s-banner>}
      {!loading && !error && points.length === 0 && (
        <s-text tone="subdued">{t.empty}</s-text>
      )}

      {!loading && !error && points.length > 0 && view === "list" && (
        <s-scroll-box maxBlockSize="320px" accessibilityLabel={t.heading}>
          <s-choice-list
            name="pickup-point"
            variant="block"
            values={selectedId ? [selectedId] : []}
            onChange={(event) => {
              const next = event.target.value ?? event.target.values?.[0];
              if (next) setSelectedId(next);
            }}
          >
            {points.map((p) => (
              <s-choice key={p.id} value={p.id}>
                <s-stack gap="tight">
                  <s-stack direction="inline" gap="tight">
                    <s-text weight="bold">{p.name}</s-text>
                    {p.distanceKm != null && (
                      <s-badge tone="info">{formatDistance(p.distanceKm)}</s-badge>
                    )}
                  </s-stack>
                  <s-text tone="subdued">
                    {formatAddress(p)}
                    {p.carrier ? ` · ${p.carrier}` : ""}
                  </s-text>
                </s-stack>
              </s-choice>
            ))}
          </s-choice-list>
        </s-scroll-box>
      )}

      {!loading && !error && points.length > 0 && view === "map" && googleMapsApiKey && (
        <s-stack gap="tight">
          <s-map
            apiKey={googleMapsApiKey}
            latitude={points[0].lat}
            longitude={points[0].lng}
            zoom="6"
            blockSize="22rem"
            inlineSize="100%"
            accessibilityLabel={t.heading}
          >
            {points.map((p) => (
              <s-map-marker
                key={p.id}
                latitude={p.lat}
                longitude={p.lng}
                accessibilityLabel={p.name}
                onClick={() => setSelectedId(p.id)}
              ></s-map-marker>
            ))}
          </s-map>
          {selectedPoint && (
            <s-text>
              {t.selected}: <s-text weight="bold">{selectedPoint.name}</s-text> —{" "}
              {formatAddress(selectedPoint)}
            </s-text>
          )}
        </s-stack>
      )}

      {!loading && !error && points.length > 0 && view === "map" && !googleMapsApiKey && (
        <s-banner tone="warning">
          Falta configurar GOOGLE_MAPS_API_KEY en el backend para la vista de mapa.
        </s-banner>
      )}

      {saveError && <s-banner tone="critical">{saveError}</s-banner>}

      <s-button
        variant="primary"
        disabled={!selectedPoint || saving}
        onClick={confirmSelection}
      >
        {saving ? t.confirming : t.confirm}
      </s-button>
    </s-stack>
  );
}

function isPickupDeliveryOptionSelected() {
  try {
    const groups = shopify.deliveryGroups?.value || [];
    return groups.some((group) => {
      const selectedHandle = group.selectedDeliveryOption?.handle;
      if (!selectedHandle) return false;
      const option = group.deliveryOptions?.find((o) => o.handle === selectedHandle);
      return option?.title?.trim().toLowerCase() === PICKUP_DELIVERY_OPTION_TITLE;
    });
  } catch {
    // Si la API cambia de forma o aún no hay datos (dirección sin
    // completar), no rompemos la extensión: simplemente no se muestra.
    return false;
  }
}

function formatAddress(point) {
  const parts = [point.address.line1];
  if (point.address.line2) parts.push(point.address.line2);
  const cityLine = [point.address.postalCode, point.address.city]
    .filter(Boolean)
    .join(" ");
  if (cityLine) parts.push(cityLine);
  return parts.join(", ");
}

function formatDistance(km) {
  const value = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return `a ${value.replace(".", ",")} km`;
}
