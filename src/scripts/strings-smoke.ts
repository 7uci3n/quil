import { log } from "../lib/log.js";
import { t } from "../lib/i18n.js";

log.info("invalid:", t("errors.invalid.random"));
log.info("perm:", t("errors.permission.guild_member_only"));
log.info(
  "lfg added:",
  t("lfg.added", { user: "@Donnie", tierLabel: "Low Tier" }),
);
log.info("-- -- END SMOKE TEST -- --");
