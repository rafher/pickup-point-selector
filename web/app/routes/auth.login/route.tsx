import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/es.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { login } from "../../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = await login(request);

  return json({ errors, polarisTranslations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await login(request);

  return json({ errors });
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const errors = actionData?.errors || loaderData.errors;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page narrowWidth>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Selector de punto de recogida
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Dominio de la tienda"
                helpText="mi-tienda.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="off"
                error={errors?.shop}
              />
              <Button submit>Entrar</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
