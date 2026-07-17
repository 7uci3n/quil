# buy command

[Home](README.md) / [Commands](README.md) / [buy](buy.md)

## Purpose

- Records a purchase for the invoking player's character and deducts GP (stored as CP in the DB).
- Intended for tracking player expenditures in the guild resource channel.

## Location

- Implementation: `src/commands/buy.ts`
- DB table used: `charlog` (row per player)

## Slash command signature

- Name: `/buy`
- Description: "Buy an item for GP and record it to your character log."
- Options:
  - `item` (string, required) — What the player is buying. Trimmed; must not be empty.
  - `amount` (number, required) — Price in GP. Must be > 0 and have at most 2 decimal places (GP precision). Minimum value is 0.01.

## Behavior / Contract

## Inputs

- Interaction: `ChatInputCommandInteraction` from Discord.js.

## Outputs / Side effects

- Returns an ephemeral reply when validation fails (so only the user sees the failure).
- On success replies publicly (non-ephemeral) with a localized success message.
- Updates `charlog.cp` in the database by subtracting the purchase amount converted to copper (cp).

## Data shapes

- PlayerRow (in code):
  - `userId: string`
  - `name: string`
  - `level: number`
  - `xp: number`
  - `cp: number` (stored as integer copper)
  - `tp: number`

## Key helpers in `src/commands/buy.ts`

- toCp(gp: number): number — converts GP to CP using 100 CP = 1 GP (rounded).
- toGp(cp: number): string — converts integer CP back to a GP string with two decimals.
- getPlayer(userId: string) — SELECT \* FROM charlog WHERE userId = ?; returns a PlayerRow or undefined.
- subCp(userId: string, deltaCp: number) — UPDATE charlog SET cp = cp - ? WHERE userId = ?; performs the subtraction.

## Validation and errors

- Channel guard: When `CONFIG.guild.config.channels.resourceTracking` is set (a channel id), the command only runs in that channel. If invoked elsewhere it replies ephemeral with `buy.notInResourceChannel`.
- `item` must be non-empty after trimming — replies ephemeral with `buy.errors.invalidItem` on failure.
- `amount` must be > 0 — replies ephemeral with `buy.errors.invalidAmount` if not.
- Decimal precision: more than 2 decimals is rejected with `buy.errors.invalidPrecision`.
- Player row required: If there is no `charlog` row for the user the command replies ephemeral with `buy.errors.noPlayerRecord`.

## Localization keys used

- `buy.notInResourceChannel`
- `buy.errors.invalidItem`
- `buy.errors.invalidAmount`
- `buy.errors.invalidPrecision`
- `buy.errors.noPlayerRecord`

## SQL / DB effects

- Reads the player's row via `getPlayer` (SELECT).
- Executes `UPDATE charlog SET cp = cp - ? WHERE userId = ?` to subtract CP.
- Reads the player's row again to compute the new GP total for display.

## Edge cases & notes for maintainers

- Race conditions: The command does a read -> update -> read. Concurrency could cause small inconsistencies if multiple commands change CP for the same user concurrently. If strict consistency is needed consider using a single UPDATE with RETURNING (if supported by the DB) or running the two statements in a transaction.
- Precision / rounding: `toCp` uses Math.round(gp \* 100) and the command rejects inputs that are not exact to two decimals. This prevents floating-point surprises but requires the frontend/UX to only allow two decimal places.
- Non-existent player rows: The command currently fails gracefully and informs the user to create/initialize their character before buying. There is no automatic row creation.
- Bot permissions: The bot must be able to send messages in the resource-tracking channel. The code does not check granular channel permissions beyond the channel id guard.
- Embeds: The code contains commented-out `EmbedBuilder` logic. If you re-enable it, ensure the embed content is localized and tested for length.

## Examples

- Slash usage (as a user):
  - `/buy item:"Rope" amount:1.50` — Deducts 1.50 GP (150 CP) from the invoking player's `charlog.cp` and replies with a success message containing the new GP total.

## Testing suggestions

- Unit test: mock `getDb()` to return a controlled DB object and assert that `UPDATE charlog SET cp = cp - ?` is called with expected CP when given various amounts.
- Integration test: with a test DB, create a `charlog` row, invoke `execute()` with an interaction stub and assert the DB value changed and a success reply was sent.
- Validation tests: ensure invalid amounts (0, negative, >2 decimals) return the correct ephemeral error keys.

## How to improve later

- Add transactional update to avoid read-after-write anomalies.
- Add an optional flag to record a vendor / note.
- Re-enable the embed response for a richer confirmation message.
- Consider emitting an event (e.g. `resourceChange`) so other systems (like a tracking channel) can observe purchases.

## Where to look next

- Related commands: `sell`, `gp`, `guildfund` in `src/commands/` — they likely share patterns for currency handling.
- DB schema & migrations: `data/migrations` and `src/db` for `charlog` structure and access patterns.

Maintainer contact

- Author: see git history for `src/commands/buy.ts`.

  ***

This document was generated from the implementation at `src/commands/buy.ts`. Keep it updated if the code changes.
