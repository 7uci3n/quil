import { log } from "../lib/log.js";
import { t } from "../lib/i18n.js";

log.info("invalid:", t("errors.invalid.random"));
log.info("perm:", t("errors.permission.guild_member_only"));
log.info(
  "lfg added:",
  t("lfg.toggle.added", { tierUpper: "LOW", activeList: "`low`" }),
);
log.info("-- -- END SMOKE TEST -- --");
