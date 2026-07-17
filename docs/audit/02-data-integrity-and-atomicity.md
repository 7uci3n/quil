# 02 — Data Integrity & Atomicity

[← Index](README.md)

The money/character core. Every DB call is a real `await` (async `sqlite`
wrapper), so there is **no synchronous-execution guarantee** protecting
check-then-act sequences — the concurrency concerns below are genuine.

---

## 🟠 DATA-1 — Balances can go negative (no atomic debit)

- [ ] **`src/utils/db_queries.ts:71-84`, `src/commands/buy.ts:111-169`, `src/commands/sell.ts`, `src/commands/resource.ts`** · Verified: hand + 2 agents
- **Issue:** `adjustResource` emits `` `${col} = ${col} + ?` `` with no floor and no
  `WHERE … >= ?` guard. The only protection is the caller's read-then-validate,
  which spans multiple awaits. Two concurrent `/buy` (or `/buy` racing `/sell`) for
  the same user both pass the funds check on the same snapshot and overspend into a
  negative balance. (The column **allowlist** at `db_queries.ts:63-68` does correctly
  prevent column injection, and values are parameterized — this is purely an
  integrity/concurrency gap, not injection.)
- **Fix:** Make the debit atomic — conditional `UPDATE … SET cp = cp - ? WHERE userId = ? AND cp >= ?`,
  treat `changes === 0` as insufficient funds; or wrap read+write in a transaction.

---

## 🟠 DATA-2 — `/retire` money mutation is not atomic (Crew Coin loss)

- [ ] **`src/commands/retire.ts:102-149`** · Verified: hand + agent
- **Issue:** `DELETE` (102) → CC transfer to next character (111-124 / 142-148) →
  `active = 1` promotion (126-134) run as separate awaited statements with no
  transaction and no `try/catch`. A failure/crash after the DELETE but before the
  transfer **permanently loses the retired character's `cc`**. Any DB error also
  leaves the interaction unanswered.
- **Fix:** Wrap the whole sequence in a transaction with rollback; reply on error.
  (Fix `SEC-1` in the same edit.)

---

## 🟠 DATA-3 — `/buy` Crew-Coin scope mismatch

- [ ] **`src/commands/buy.ts:132-137,164-167`** · Verified: agent
- **Issue:** The funds check reads `getPlayerCC` (SUM of `cc` across _all_ the user's
  characters) but `adjustResource` deducts `cc` from the **active** character only.
  A user whose CC is spread across characters passes the check yet drives the active
  char's `cc` negative.
- **Fix:** Debit against the same scope you validate (sum, or a chosen character),
  inside one transaction. Depends on / overlaps `DATA-1`.

---

## 🟡 DATA-4 — "One active character" invariant is not enforced

- [ ] **`src/utils/db_queries.ts:88-104` (`setActive`)** · Verified: hand + agent
- **Issue:** Enforced by two separate awaited UPDATEs (`active=0 WHERE name != ?`,
  then `active=1 WHERE name = ?`) with no transaction and no DB constraint.
  Concurrent `/swap` + `/initiate` can interleave to leave **zero or two** active
  rows. Line 99 also runs an `UPDATE` through `db.get` (expects a SELECT) — works by
  luck, always returns `undefined`.
- **Fix:** Single transaction; add a partial unique index (`… WHERE active = 1`) as a
  hard guarantee; use `db.run` for the UPDATE.

---

## 🟡 DATA-5 — Inconsistent DTP day-boundary normalization

- [ ] **`src/db/index.ts:121-122` vs `src/domain/resource.ts:18-20` vs `src/commands/initiate.ts:42-43`** · Verified: agent
- **Issue:** The migration default aligns `dtp_updated` to `86400`, while runtime
  accrual and `/initiate` align to `86400 / DTP_RATE` (= `43200` at rate 2). It stays
  integer-correct only because 2 divides 86400; a non-divisor rate yields fractional
  accrual written into the INTEGER `dtp` column. `index.ts:121` also computes
  `getTime()/1000` with no `Math.round`, so the column DEFAULT is a fractional literal.
- **Fix:** Normalize consistently with the runtime period and `Math.round`.
- **Note:** The 365-day cap itself is correct (early return at `>= DTP_MAX`, inclusive
  `Math.min`) — no off-by-one (`src/domain/resource.ts:14,23-25`).

---

## 🟡 DATA-6 — `dmrewards.json` reward-curve anomalies

- [ ] **`config/dmrewards.json:10,25`** · Verified: agent
- **Issue:** Level 20 `xp: 625` and level 7 `xp: 1650` (below level 6's `2250`).
  Likely data-entry typos; `getDmRow` returns them verbatim, so DMs at those levels
  get wrong rewards.
- **Fix:** Confirm intended values with the game design and correct the data.

---

## 🟡 DATA-7 — `/sync` leaves a transaction open on error (connection poisoning)

- [ ] **`src/commands/sync.ts:15-30`** · Verified: agent
- **Issue:** `db.exec('BEGIN TRANSACTION')` with no `try/catch/rollback`. If any
  insert/DELETE throws, `COMMIT` is never reached and the transaction stays open on
  the **shared** `_db` connection, poisoning every subsequent command until restart.
- **Fix:** `try { … COMMIT } catch { ROLLBACK; … }`. (See also `BUG-6` for the missing
  `deferReply`.) — cross-listed because it is both a correctness bug and an
  atomicity gap.

---

### Transaction/atomicity scoreboard

Only `/sync` uses explicit transactions at all — **no money-mutating command does**.
`retire`, `buy`, `sell`, `resource`, `rewards`, `setActive`, `initiate` all perform
multi-step mutations across awaits with no atomicity.
