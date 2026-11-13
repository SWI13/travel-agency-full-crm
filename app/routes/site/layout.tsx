import { useEffect } from "react";
import { data, Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { translate } from "~/i18n";
import { isLocale } from "~/lib/constants";
import { publicPackages, publicSite } from "~/server/site.server";
import { FloatingWhatsApp, MobileCtaBar, SiteFooter, SiteHeader } from "~/site/components";
import { agencyName, captureUtm } from "~/site/helpers";

export async function loader({ params }: Route.LoaderArgs) {
  if (!isLocale(params.lang)) throw data(null, { status: 404 });
  const [site, packages] = await Promise.all([publicSite(), publicPackages()]);
  return { site, packages, lang: params.lang };
}

export function meta({ data: loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Not found" }];
  const { site, lang } = loaderData;
  return [
    { title: `${agencyName(site, lang)} — ${translate(lang, "site.meta.title")}` },
    { name: "description", content: translate(lang, "site.meta.description") },
    { property: "og:type", content: "website" },
    { property: "og:title", content: `${agencyName(site, lang)} — ${translate(lang, "site.meta.title")}` },
  ];
}

export type SiteLoaderData = Awaited<ReturnType<typeof loader>>;

export default function SiteLayout({ loaderData }: Route.ComponentProps) {
  useEffect(() => captureUtm(), []);
  return (
    <div className="theme-site min-h-dvh flex flex-col">
      <SiteHeader site={loaderData.site} />
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
      <SiteFooter site={loaderData.site} />
      <MobileCtaBar site={loaderData.site} />
      <FloatingWhatsApp site={loaderData.site} />
    </div>
  );
}
