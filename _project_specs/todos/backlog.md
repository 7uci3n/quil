# Backlog

Future work, prioritized. Move to active.md when starting.

---

<!-- Add todos here -->

## LFG — deferred (accepted "for now" 2026-07-17)

- [ ] **Per-tier LFG age for purge/status.** `lfg_status` stores a single
      `startedAt` (stamped when the first tier was enabled), so purge age and status
      "waiting" are per-entry, not per-tier. Per-tier ages need a schema change
      (per-tier timestamps) + migration.
  - _Accepted as per-entry for now._
- [ ] **Revisit `/lfg purge` scope wording.** Choices are "All" (= tiered only,
      low/mid/high/epic) and "Only Play-by-Post" (pbp only); the mods' spec phrases the
      second as "include PBP." PBP is deliberately isolated for now — revisit if the
      desired semantics change (would require re-registering the command).
