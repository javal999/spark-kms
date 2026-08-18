# Monthly usage snapshot

The repo can prove the system is correct. It cannot prove anyone uses it — that
question came back "unverifiable" in the 2026-08-13 project evaluation. This
file is the record that makes it answerable.

**Cadence:** first working day of the month, about ten minutes.

## How to fill a row

1. Open `/insights` as a super-admin and set the date window to the month just
   ended.
2. Read off: active users (pseudonymous `actorHash` count), total page views,
   and the top initiative by views.
3. On `/leaderboard`, count how many of the 24 areas (6 regions × 4 segments)
   scored anything that month.
4. Add a row below. One line of comment on anything that moved.

All figures are aggregate and pseudonymous; do not record names here. Retention
is 90 days (`ops-usage-retention.md`), so a month left unrecorded is gone.

| Month | Active users | Page views | Areas scoring | Entries submitted | Note |
|---|---|---|---|---|---|
| 2026-08 | | | | | |

## What the numbers are for

- **Areas scoring** is the adoption number that matters: the app replaced a
  weekly spreadsheet, so the target is that the same areas which used to appear
  in the spreadsheet appear in the ledger.
- **Active users versus areas scoring** separates reading from contributing. A
  gap means people look but do not submit, which is a product problem, not a
  bug.
- Three consecutive months of a flat or falling area count is the signal to go
  ask the regions what broke, before adding any feature.
