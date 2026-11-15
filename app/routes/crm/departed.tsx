import { PageBody } from "~/crm/shell";
import { useI18n } from "~/i18n";
import { PageHeader } from "~/ui";
import { DepartedTable } from "./bookings";

/** Customers who have actually travelled. Their booking and customer records stay available. */
export default function DepartedPage() {
  const { t } = useI18n();
  return (
    <PageBody>
      <PageHeader title={t("crm.nav.departed")} subtitle={t("crm.departedPage.subtitle")} />
      <DepartedTable />
    </PageBody>
  );
}
