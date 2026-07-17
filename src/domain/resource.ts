import { CONFIG } from "../config/resolved.js";
import { adjustResource, getPlayer } from "../utils/db_queries.js";
import { dtpDayBoundary, dtpPeriod } from "./dtp.js";

const CFG = CONFIG.guild!.config;
const DTP_RATE = CFG.features.dtp?.rate || 1;
const DTP_MAX = CFG.features.dtp?.max || 365;

export async function updateDTP(
  user: string,
  char: string = "",
): Promise<number | null> {
  const row = await getPlayer(user, char);
  if (!row) {
    return null;
  }

  // If already at or over cap, don't accrue more DTP
  if (row.dtp >= DTP_MAX) {
    return row.dtp;
  }

  const timestampNormal = dtpDayBoundary(Date.now() / 1000, DTP_RATE);
  const dtpcalc =
    row.dtp + (timestampNormal - row.dtp_updated) / dtpPeriod(DTP_RATE);

  // Cap at maximum
  const dtpFinal = Math.min(dtpcalc, DTP_MAX);

  return (
    (
      await adjustResource(
        user,
        ["dtp", "dtp_updated"],
        [dtpFinal, timestampNormal],
        true,
        row.name,
      )
    )?.dtp ?? 0
  );
}
