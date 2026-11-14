// makefun-coin-launch-01 — pump.fun launcher.
//
// Creates the bounty coin on Solana mainnet, then writes its mint and the
// create transaction's signature into ../LAUNCH.json.
//
// SAFETY: dry-run is the default. Nothing is signed or broadcast unless
// --live is passed explicitly. Run --dry-run first, read the summary, and
// only then run with --live after the funder approved the exact SOL amount.
//
//   cd scripts && npm install            # one-time: installs @solana/web3.js
//   node launch.mjs --keypair <path-to-keypair.json> --dry-run
//   node launch.mjs --keypair <path-to-keypair.json> --live [--buy-sol 0.05]
//
// The keypair path is an argument; no secret is stored in this file or in
// the repository. The coin's logo is make.fun's ghost mascot downloaded
// unmodified from https://make.fun/press/mark-1024.png, and its metadata
// description carries exactly: made for make.fun $1000 bounty.
//
// Cost (Nov 2026, SOL ~$77): creating a coin on pump.fun costs roughly
// 0.02 SOL of rent + fees for the create transaction itself, plus the
// priority fee and an optional first buy. Budget ~0.03 SOL with no buy,
// ~0.1 SOL with a small first buy, and keep ~0.0035 SOL spare in the wallet
// for the later prize-claim rent.
//
// Node 22. Requires @solana/web3.js (see package.json). No other deps.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
// The global account and the event authority are PDAs of the pump.fun
// program (seeds "global" and "__event_authority"); derived here instead of
// hardcoded so a typo can never point at a dead address again. The fee
// recipient is read from the global account at run time (see fetchGlobal),
// because pump.fun rotates it.
const GLOBAL_ACCOUNT = PublicKey.findProgramAddressSync(
  [Buffer.from("global")],
  PUMP_PROGRAM_ID,
)[0];
const EVENT_AUTHORITY = PublicKey.findProgramAddressSync(
  [Buffer.from("__event_authority")],
  PUMP_PROGRAM_ID,
)[0];
const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const CREATE_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
const BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 38, 12, 163, 189]);

const LOGO_URL = "https://make.fun/press/mark-1024.png";
const TOKEN_NAME = "MakeFun Ghost";
const TOKEN_SYMBOL = "GHOST";
const TOKEN_DESCRIPTION = "made for make.fun $1000 bounty";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
// Rent + fees for the create transaction itself (no first buy). Kept as a
// planning figure only; the real cost is whatever the chain charges.
const CREATE_COST_SOL = 0.03;
const SOL_PER_LAMPORT = 1 / LAMPORTS_PER_SOL;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { buySol: 0, live: false, priorityFeeSol: 0.0005, rpc: DEFAULT_RPC };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keypair") args.keypair = argv[++i];
    else if (a === "--rpc") args.rpc = argv[++i];
    else if (a === "--buy-sol") args.buySol = Number(argv[++i]);
    else if (a === "--priority-fee-sol") args.priorityFeeSol = Number(argv[++i]);
    else if (a === "--name") args.name = argv[++i];
    else if (a === "--symbol") args.symbol = argv[++i];
    else if (a === "--live") args.live = true;
    else if (a === "--dry-run") args.live = false;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error("unknown argument: " + a);
  }
  return args;
}

function usage() {
  console.log(
    [
      "Usage: node launch.mjs --keypair <path-to-keypair.json> [--dry-run|--live] [options]",
      "",
      "  --keypair <path>       Solana keypair JSON (64-number array). Required.",
      "  --dry-run              Default. Validate everything, broadcast nothing.",
      "  --live                 Actually create the coin and write ../LAUNCH.json.",
      "  --buy-sol <n>          First buy in SOL after creation (default 0 = no buy).",
      "  --rpc <url>            Solana RPC (default " + DEFAULT_RPC + ").",
      "  --priority-fee-sol <n> Priority fee in SOL (default 0.0005).",
      "  --name <name>          Token name (default \"" + TOKEN_NAME + "\").",
      "  --symbol <sym>         Token symbol (default \"" + TOKEN_SYMBOL + "\").",
      "",
      "The description is always exactly: " + TOKEN_DESCRIPTION,
    ].join("\n"),
  );
}

function encodeString(value) {
  const bytes = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

function findPda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function associatedTokenAddress(owner, mint) {
  return findPda(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

function buildCreateInstruction({ mint, user, name, symbol, uri }) {
  const bondingCurve = findPda(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  );
  const metadata = findPda(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID,
  );
  const data = Buffer.concat([
    CREATE_DISCRIMINATOR,
    encodeString(name),
    encodeString(symbol),
    encodeString(uri),
  ]);
  return {
    bondingCurve,
    instruction: new TransactionInstruction({
      data,
      keys: [
        { isSigner: true, isWritable: true, pubkey: mint },
        { isSigner: false, isWritable: true, pubkey: bondingCurve },
        { isSigner: false, isWritable: true, pubkey: bondingCurve },
        {
          isSigner: false,
          isWritable: true,
          pubkey: associatedTokenAddress(bondingCurve, mint),
        },
        { isSigner: false, isWritable: true, pubkey: GLOBAL_ACCOUNT },
        { isSigner: false, isWritable: true, pubkey: metadata },
        { isSigner: true, isWritable: true, pubkey: user },
        { isSigner: false, isWritable: false, pubkey: SystemProgram.programId },
        { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
        { isSigner: false, isWritable: false, pubkey: ASSOCIATED_TOKEN_PROGRAM_ID },
        { isSigner: false, isWritable: false, pubkey: SYSVAR_RENT_PUBKEY },
        { isSigner: false, isWritable: false, pubkey: EVENT_AUTHORITY },
        { isSigner: false, isWritable: false, pubkey: PUMP_PROGRAM_ID },
      ],
      programId: PUMP_PROGRAM_ID,
    }),
  };
}

function buildBuyInstruction({ mint, bondingCurve, feeRecipient, user, tokenAmount, maxSolCost }) {
  const data = Buffer.alloc(8 + 8 + 8);
  BUY_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(BigInt(tokenAmount), 8);
  data.writeBigUInt64LE(BigInt(maxSolCost), 16);
  return new TransactionInstruction({
    data,
    keys: [
      { isSigner: false, isWritable: false, pubkey: GLOBAL_ACCOUNT },
      { isSigner: false, isWritable: true, pubkey: feeRecipient },
      { isSigner: false, isWritable: false, pubkey: mint },
      { isSigner: false, isWritable: true, pubkey: bondingCurve },
      {
        isSigner: false,
        isWritable: true,
        pubkey: associatedTokenAddress(bondingCurve, mint),
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: associatedTokenAddress(user, mint),
      },
      { isSigner: true, isWritable: true, pubkey: user },
      { isSigner: false, isWritable: false, pubkey: SystemProgram.programId },
      { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
      { isSigner: false, isWritable: false, pubkey: SYSVAR_RENT_PUBKEY },
      { isSigner: false, isWritable: false, pubkey: EVENT_AUTHORITY },
      { isSigner: false, isWritable: false, pubkey: PUMP_PROGRAM_ID },
    ],
    programId: PUMP_PROGRAM_ID,
  });
}

async function downloadLogo() {
  const res = await fetch(LOGO_URL);
  if (!res.ok) throw new Error("logo download failed: HTTP " + res.status);
  const bytes = Buffer.from(await res.arrayBuffer());
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(pngMagic)) {
    throw new Error("logo is not a PNG — refusing to use a modified image");
  }
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function uploadMetadata({ logoBytes, name, symbol }) {
  const form = new FormData();
  form.append("file", new Blob([logoBytes], { type: "image/png" }), "mark-1024.png");
  form.append("name", name);
  form.append("symbol", symbol);
  form.append("description", TOKEN_DESCRIPTION);
  form.append("twitter", "");
  form.append("telegram", "");
  form.append("website", "");
  const res = await fetch("https://pump.fun/api/ipfs", { body: form, method: "POST" });
  if (!res.ok) throw new Error("metadata upload failed: HTTP " + res.status);
  const json = await res.json();
  if (!json.metadataUri) throw new Error("metadata upload returned no metadataUri");
  return json.metadataUri;
}

async function fetchFeeRecipient(connection) {
  // Global account layout: 8-byte discriminator, 1-byte initialized flag,
  // 32-byte authority, then the 32-byte feeRecipient.
  const info = await connection.getAccountInfo(GLOBAL_ACCOUNT);
  if (!info) throw new Error("pump.fun global account not found on chain");
  return new PublicKey(info.data.subarray(41, 73));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.keypair) throw new Error("--keypair <path> is required");
  if (!(args.buySol >= 0)) throw new Error("--buy-sol must be >= 0");

  const name = args.name ?? TOKEN_NAME;
  const symbol = args.symbol ?? TOKEN_SYMBOL;
  const secret = JSON.parse(readFileSync(args.keypair, "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(args.rpc, "confirmed");

  const balanceLamports = await connection.getBalance(payer.publicKey);
  const balanceSol = balanceLamports * SOL_PER_LAMPORT;
  const neededSol = CREATE_COST_SOL + args.buySol + args.priorityFeeSol + 0.005;
  console.log("wallet: " + payer.publicKey.toBase58());
  console.log("balance: " + balanceSol.toFixed(6) + " SOL");
  console.log("estimated need: ~" + neededSol.toFixed(4) + " SOL (create ~" + CREATE_COST_SOL +
    " + buy " + args.buySol + " + priority fee " + args.priorityFeeSol + " + buffer 0.005)");
  if (balanceSol < neededSol) {
    throw new Error(
      "insufficient SOL: balance " + balanceSol.toFixed(6) + " < needed ~" +
      neededSol.toFixed(4) + ". Fund the wallet first, then run again.",
    );
  }

  const logo = await downloadLogo();
  console.log("logo: " + LOGO_URL + " (" + logo.bytes.length + " bytes, sha256 " + logo.sha256 + ")");

  let metadataUri;
  if (args.live) {
    metadataUri = await uploadMetadata({ logoBytes: logo.bytes, name, symbol });
    console.log("metadataUri: " + metadataUri);
  } else {
    console.log("[dry-run] would upload metadata to https://pump.fun/api/ipfs with");
    console.log("[dry-run]   name=" + name + " symbol=" + symbol +
      " description=\"" + TOKEN_DESCRIPTION + "\" + the logo above");
    metadataUri = "https://example.invalid/metadata.json (dry-run placeholder)";
  }

  const mint = Keypair.generate();
  console.log("mint (new): " + mint.publicKey.toBase58());

  const { bondingCurve, instruction: createIx } = buildCreateInstruction({
    mint: mint.publicKey,
    name,
    symbol,
    uri: metadataUri,
    user: payer.publicKey,
  });
  console.log("bonding curve: " + bondingCurve.toBase58());

  const units = 300000;
  const microLamports = Math.round((args.priorityFeeSol * LAMPORTS_PER_SOL * 1e6) / units);
  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units }));
  tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  tx.add(createIx);
  tx.feePayer = payer.publicKey;
  const latest = await connection.getLatestBlockhash();
  tx.recentBlockhash = latest.blockhash;
  tx.sign(mint, payer);

  if (!args.live) {
    console.log("[dry-run] create transaction built and signed locally (NOT sent).");
    console.log("[dry-run] serialized size: " + tx.serialize().length + " bytes");
    console.log("[dry-run] re-run with --live to broadcast. Nothing was created on chain.");
    return;
  }

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });
  console.log("create signature: " + signature);
  const confirmation = await connection.confirmTransaction(
    { blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight, signature },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error("create transaction failed: " + JSON.stringify(confirmation.value.err));
  }
  const parsed = await connection.getTransaction(signature, { commitment: "confirmed" });
  if (!parsed || parsed.meta?.err) {
    throw new Error("create transaction not confirmed error-free; check the explorer before proceeding");
  }
  console.log("coin created: https://pump.fun/coin/" + mint.publicKey.toBase58());

  if (args.buySol > 0) {
    const feeRecipient = await fetchFeeRecipient(connection);
    console.log("fee recipient (from global account): " + feeRecipient.toBase58());
    const curveInfo = await connection.getAccountInfo(bondingCurve);
    if (!curveInfo) throw new Error("bonding curve account not found after create");
    const data = curveInfo.data;
    const virtualTokenReserves = data.readBigUInt64LE(8);
    const virtualSolReserves = data.readBigUInt64LE(16);
    const solIn = BigInt(Math.round(args.buySol * LAMPORTS_PER_SOL));
    const solInAfterFee = (solIn * 99n) / 100n; // pump.fun 1% buy fee
    const tokenAmount =
      virtualTokenReserves -
      (virtualTokenReserves * virtualSolReserves) / (virtualSolReserves + solInAfterFee);
    const maxSolCost = (solIn * 105n) / 100n; // 5% slippage
    const buyTx = new Transaction();
    buyTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }));
    buyTx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
    buyTx.add(buildBuyInstruction({
      bondingCurve,
      feeRecipient,
      maxSolCost: Number(maxSolCost),
      mint: mint.publicKey,
      tokenAmount: Number(tokenAmount),
      user: payer.publicKey,
    }));
    buyTx.feePayer = payer.publicKey;
    buyTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const buySig = await connection.sendTransaction(buyTx, [payer], { skipPreflight: false });
    await connection.confirmTransaction(buySig, "confirmed");
    console.log("first buy: " + args.buySol + " SOL -> ~" + tokenAmount.toString() +
      " tokens, tx " + buySig);
  }

  const launch = {
    create_signature: signature,
    mint: mint.publicKey.toBase58(),
  };
  const launchPath = join(REPO_ROOT, "LAUNCH.json");
  writeFileSync(launchPath, JSON.stringify(launch, null, 2) + "\n", "utf8");
  console.log("wrote " + launchPath);
  console.log("next: git add LAUNCH.json && git commit && push, then submit that commit.");
}

main().catch((err) => {
  console.error("launch failed: " + err.message);
  process.exit(1);
});
