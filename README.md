# makefun-coin-launch-01 — Race to launch a real coin on Solana

Entry for the make.fun bounty "Race to launch a real coin on Solana"
($1,000 over the 100 fastest launches, places by earliest on-chain coin
creation). The coin is created on pump.fun; this repository hands in its
mint and the signature of the transaction that created it.

## Status

**Launch pending.** `LAUNCH.json` still holds placeholders — no coin has
been created yet. The launch waits for funding approval: the payout wallet
currently holds **0 SOL** (checked 14 Nov 2026, ~08:35 WIB, on two public
RPCs). Estimated launch cost is ~0.02–0.03 SOL for the create transaction
(no first buy), so the wallet needs at least ~0.1 SOL to launch safely
(see `scripts/launch.mjs` and the experiments ledger). Nothing here has
broadcast any transaction or spent any SOL.

## Files

- `main.ts` — the graded program (Node 22, stdlib only, plain JavaScript).
  Copies `LAUNCH.json` from the repository to the output directory. That is
  all it does: no network, no clock, deterministic output.
- `LAUNCH.json` — `{"mint": ..., "create_signature": ...}`. Placeholders
  until the coin is launched; the launch script fills them in.
- `scripts/launch.mjs` — the one-command pump.fun launcher the agent runs
  to actually create the coin. Dry-run by default; it only broadcasts with
  `--live`. Takes the wallet keypair path as an argument, holds no secret.
- `.makefun/owner.json` — proves the repository belongs to the account's
  payout wallet.
- `LICENSE` — MIT.

## The coin

- Logo: make.fun's ghost mascot, unmodified, from
  `https://make.fun/press/mark-1024.png` (downloaded live by the launch
  script, never redrawn or edited).
- Token metadata description contains the exact sentence:
  `made for make.fun $1000 bounty`.
- Name: `MakeFun Ghost`, symbol: `GHOST`.

## Run the program (as the grader does)

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`out/LAUNCH.json` is then byte for byte this repository's `LAUNCH.json`.

## Launch the coin (parent / agent only, after funding approval)

```sh
cd scripts && npm install          # installs @solana/web3.js once
node launch.mjs --keypair <path-to-keypair.json> --dry-run   # default: no broadcast
node launch.mjs --keypair <path-to-keypair.json> --live      # creates the coin
```

`--live` writes the real mint + create signature into `LAUNCH.json`, then
commit and submit that commit before the deadline (15 Nov 2026, 07:30 WIB).

## Competition

- Opens: 14 Nov 2026 00:30 UTC (07:30 WIB). Deadline: 15 Nov 2026 00:30 UTC.
- Prizes: 1st $250, 2nd $60, 3rd $50, 4th–10th $20, 11th–25th $10,
  26th–50th $8, 51st–100th $3, in USDC on Solana.
- At most 5 submissions/day, 10 total per account (this connection: 3/day).
