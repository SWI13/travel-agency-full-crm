import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/alexandria/index.css";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./app.css";

import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/root";
import { I18nProvider, translate } from "./i18n";
import { dirOf, isLocale, type Locale } from "./lib/constants";
import { readCookie } from "./server/session.server";

export const CRM_LOCALE_COOKIE = "crm_locale";

export async function loader({ request }: Route.LoaderArgs) {
  const cookie = readCookie(request, CRM_LOCALE_COOKIE);
  return { crmLocale: isLocale(cookie) ? cookie : null };
}

/** Website language comes from the URL (/ar, /fr, /en); the dashboard uses the employee's choice. */
function useLocale(): Locale {
  const data = useRouteLoaderData<typeof loader>("root");
  const segment = useLocation().pathname.split("/")[1];
  if (isLocale(segment)) return segment;
  return data?.crmLocale ?? "fr";
}

export const links: Route.LinksFunction = () => [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }];

export function Layout({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const locale = useLocale();
  return (
    <I18nProvider locale={locale}>
      <Outlet />
    </I18nProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const locale = useLocale();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const inDashboard = useLocation().pathname.startsWith("/admin");
  const home = inDashboard ? "/admin" : `/${locale}`;
  return (
    <main className="theme-site min-h-dvh grid place-items-center px-6">
      <div className="text-center max-w-md">
        <p className="font-display text-7xl font-semibold text-brand-600">{notFound ? "404" : "!"}</p>
        <h1 className="mt-4 text-2xl font-bold">
          {notFound ? translate(locale, "site.notFound.title") : "Something went wrong"}
        </h1>
        <p className="mt-2 muted">
          {notFound ? translate(locale, "site.notFound.body") : "Please reload the page. If the problem continues, contact your administrator."}
        </p>
        <a href={home} className="btn btn-primary mt-6">
          {translate(locale, "site.notFound.home")}
        </a>
        {import.meta.env.DEV && error instanceof Error && (
          <pre className="mt-6 text-start text-xs p-4 rounded-lg bg-navy-950 text-navy-100 overflow-auto">{error.stack}</pre>
        )}
      </div>
    </main>
  );
}
