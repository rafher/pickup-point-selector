import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return json({ showForm: Boolean(login) });
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Selector de punto de recogida</h1>
        <p className={styles.text}>
          Añade a tu carrito un selector de puntos de recogida de paquetes de
          tu agencia de transporte, con vista de lista y vista de mapa.
        </p>
        {showForm && (
          <form className={styles.form} method="get" action="/auth/login">
            <label className={styles.label}>
              <span>Dominio de la tienda</span>
              <input className={styles.input} type="text" name="shop" placeholder="mi-tienda.myshopify.com" />
            </label>
            <button className={styles.button} type="submit">
              Iniciar sesión
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
