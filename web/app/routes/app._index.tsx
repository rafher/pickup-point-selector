import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  BlockStack,
  Text,
  List,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await db.shopSettings.findUnique({ where: { shop: session.shop } });

  return json({
    shop: session.shop,
    settings: {
      pickupApiUrl: settings?.pickupApiUrl ?? "",
      pickupApiKey: settings?.pickupApiKey ?? "",
      defaultView: settings?.defaultView ?? "list",
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const pickupApiUrl = String(formData.get("pickupApiUrl") || "");
  const pickupApiKey = String(formData.get("pickupApiKey") || "");
  const defaultView = String(formData.get("defaultView") || "list");

  await db.shopSettings.upsert({
    where: { shop: session.shop },
    update: { pickupApiUrl, pickupApiKey, defaultView },
    create: { shop: session.shop, pickupApiUrl, pickupApiKey, defaultView },
  });

  return json({ ok: true });
};

export default function Index() {
  const { shop, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [pickupApiUrl, setPickupApiUrl] = useState(settings.pickupApiUrl);
  const [pickupApiKey, setPickupApiKey] = useState(settings.pickupApiKey);
  const [defaultView, setDefaultView] = useState(settings.defaultView);

  const isSaving = navigation.state === "submitting";

  const handleSave = () => {
    submit({ pickupApiUrl, pickupApiKey, defaultView }, { method: "post" });
  };

  return (
    <Page title="Selector de punto de recogida">
      <Layout>
        {actionData?.ok && (
          <Layout.Section>
            <Banner tone="success" title="Ajustes guardados" />
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Conexión con el servicio web de la agencia de transporte
              </Text>
              <Text as="p" tone="subdued">
                Mientras no tengas la URL definitiva, el bloque de carrito
                mostrará automáticamente un listado de puntos de recogida de
                demostración (datos fijos) para que puedas probar la
                integración de principio a fin. En cuanto rellenes la URL
                de aquí abajo, el bloque empezará a usar el servicio real
                sin necesidad de tocar nada más.
              </Text>
              <FormLayout>
                <TextField
                  label="URL del servicio web"
                  helpText="Endpoint que devuelve el listado de puntos de recogida en JSON, opcionalmente filtrado por ?postalCode= o ?city="
                  value={pickupApiUrl}
                  onChange={setPickupApiUrl}
                  autoComplete="off"
                  placeholder="https://api.tu-agencia.com/puntos-recogida"
                />
                <TextField
                  label="API key (opcional)"
                  helpText="Se enviará como cabecera Authorization: Bearer <api key>"
                  value={pickupApiKey}
                  onChange={setPickupApiKey}
                  autoComplete="off"
                  type="password"
                />
                <Select
                  label="Vista inicial por defecto"
                  options={[
                    { label: "Lista", value: "list" },
                    { label: "Mapa", value: "map" },
                  ]}
                  value={defaultView}
                  onChange={setDefaultView}
                />
              </FormLayout>
              <Button variant="primary" loading={isSaving} onClick={handleSave}>
                Guardar ajustes
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Cómo activarlo en la tienda
              </Text>
              <List type="number">
                <List.Item>
                  Ve al editor de temas de <Text as="span" fontWeight="semibold">{shop}</Text>.
                </List.Item>
                <List.Item>Abre la plantilla del carrito (Carrito).</List.Item>
                <List.Item>Añade el bloque de aplicación "Punto de recogida".</List.Item>
                <List.Item>Personaliza las etiquetas y colores desde el propio editor de temas, y guarda.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
