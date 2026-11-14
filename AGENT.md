# Agent notes — makefun-coin-launch-01

Race to launch a real coin on pump.fun. Places go by earliest on-chain
coin creation; the 100 fastest launches share $1,000.

## Order of work

1. **Wallet.** The payout wallet must hold SOL before anything can launch.
   Check it read-only on a public RPC (`getBalance`). If it is empty, stop
   and report the balance + the estimated cost; do not launch, do not sign,
   do not broadcast.
2. **Launch the coin** with `scripts/launch.mjs` — dry-run first, then
   `--live` only after the person funding it has approved the exact SOL
   amount. The script downloads the ghost logo unmodified from
   `https://make.fun/press/mark-1024.png`, uploads the metadata (description
   carries exactly `made for make.fun $1000 bounty`), creates the coin on
   pump.fun, and writes the real mint + create signature into `LAUNCH.json`.
   Never invent a mint or a signature.
3. **Run the program** the way the grader does:
   `mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts`
   Run it twice; the two outputs must be byte-identical.
4. **Check and submit** from the kit directory (parent's step):
   `node cli/makefun.mjs check --kit . --repo <this repo> --transcripts transcripts.tar.gz`
   then submit the commit before the deadline (15 Nov 2026 00:30 UTC).

## Hard rules

- `main.ts` is plain JavaScript, stdlib only, no network, no clock. Its
  output dir defaults to the absolute `/output`
  (`process.env.MAKEFUN_OUTPUT_DIR ?? '/output'`) — never a relative
  default.
- `LAUNCH.json` holds exactly `{"mint": ..., "create_signature": ...}`.
- The coin must be created at or after the opening (14 Nov 2026 00:30 UTC)
  and before the deadline, with the unmodified mascot logo and the exact
  sentence in its description.
- Repository created after the opening, public, MIT licensed,
  `.makefun/owner.json` naming the account wallet.
- At most 5 submissions/day, 10 total (this connection caps at 3/day);
  the most recent submission is the final entry.
