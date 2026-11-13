import { Link } from "react-router";
import { Compass } from "lucide-react";
import { PageBody } from "~/crm/shell";
import { useI18n } from "~/i18n";
import { EmptyState } from "~/ui";

export default function CrmNotFound() {
  const { t } = useI18n();
  return (
    <PageBody>
      <EmptyState icon={Compass} title={t("crm.common.pageNotFound")} action={<Link to="/admin" className="btn btn-primary">{t("crm.common.backToOverview")}</Link>} />
    </PageBody>
  );
}
