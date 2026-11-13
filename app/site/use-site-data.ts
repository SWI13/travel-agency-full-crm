import { useRouteLoaderData } from "react-router";
import type { SiteLoaderData } from "~/routes/site/layout";

/** Agency details and published packages loaded once by the website layout. */
export function useSiteData(): SiteLoaderData {
  return useRouteLoaderData("routes/site/layout") as SiteLoaderData;
}
