# sell command

[Home](README.md) / [Commands](README.md) / [sell](sell.md)

## Purpose

- Record a sale for the invoking player's character and add GP to their character log.
- Mirrors the `/buy` command but credits GP to the player's stored CP.

## Location

- Implementation: `src/commands/sell.ts`
- DB table used: `charlog` (row per player)

## Slash command signature

- Name: `/sell`
- Description: "Sell an item for GP and record it to your character log."
- Options:
  - `item` (string, required) — What you sold.
  - `amount` (number, required) — Sale price in GP. Must be > 0 and have at most 2 decimal places.

## Behavior / Contract

## Inputs

- Interaction: `ChatInputCommandInteraction` from Discord.js.

## Outputs / Side effects

- Validates channel guard against `CONFIG.guild.config.channels.resourceTracking` and replies ephemeral on mismatch.
- Validates inputs (non-empty item, positive amount, max 2 decimal precision). Replies ephemeral on validation errors.
- Requires the user to have a `charlog` row; if missing replies ephemeral with `sell.errors.noPlayerRecord`.
- Calls `UPDATE charlog SET cp = cp + ? WHERE userId = ?` to credit copper, then reads the row to compute new GP total for display.
- Replies publicly (non-ephemeral) with a localized success message `sell.transactionSuccess`.

## Data shapes

- PlayerRow (in code):
  - `userId: string`
  - `name: string`
  - `level: number`
  - `xp: number`
  - `cp: number` (stored as integer copper)
  - `tp: number`

## Key helpers in `src/commands/sell.ts`

- toCp(gp: number) — Math.round(gp \* 100) converts GP to CP.
- toGp(cp: number) — converts CP back to GP string with two decimals.
- getPlayer(userId) — SELECT \* FROM charlog WHERE userId = ?
- addCp(userId, deltaCp) — UPDATE charlog SET cp = cp + ? WHERE userId = ?

## Validation and errors

- Channel guard replies with `sell.notInResourceChannel` if configured and invoked elsewhere.
- `item` must be non-empty; `amount` must be >0 and have <=2 decimal places. Errors use `sell.errors.*` localization keys.
- Missing player record returns `sell.errors.noPlayerRecord`.

## Localization keys used

- `sell.notInResourceChannel`
- `sell.errors.invalidItem`
- `sell.errors.invalidAmount`
- `sell.errors.invalidPrecision`
- `sell.errors.noPlayerRecord`
- `sell.transactionSuccess`

## SQL / DB effects

- SELECT charlog row for user
- UPDATE charlog SET cp = cp + ? WHERE userId = ?
- SELECT charlog again to compute new GP total for reply

## Edge cases & notes for maintainers

- Race conditions similar to `/buy`: read -> write -> read may be prone to concurrent updates. Consider a transaction or UPDATE ... RETURNING if supported.
- Embeds are present in code but commented out; re-enable with localization if desired.

## Examples

- `/sell item:"Old Sword" amount:3.25` — Credits 3.25 GP to your character and replies with the new GP total.

## Testing suggestions

- Unit test: mock DB to verify `addCp` is invoked with correctly rounded CP values.
- Integration test: seed a `charlog` row, run `execute()` and assert final cp value and reply text.

## How to improve later

- Consider auditing sales with a transaction log table.

## Where to look next

- `src/commands/buy.ts`, `src/db/index.ts`, and `src/config/resolved.ts`.

Maintainer contact

- Author: see git history for `src/commands/sell.ts`.

---

[Home](README.md) / [Commands](README.md) / [sell](sell.md)

This document was generated from the implementation at `src/commands/sell.ts`. Keep it updated if the code changes.
