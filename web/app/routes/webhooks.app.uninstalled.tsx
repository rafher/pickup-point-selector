import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Webhook recibido: ${topic} para ${shop}`);

  // Limpia sesión y ajustes de la tienda que desinstala la app.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  await db.shopSettings.deleteMany({ where: { shop } });

  return new Response();
};
