#!/usr/bin/env node
const { loadTacDatabase, lookupTac, getTacCount, addTacEntry } = require("./tacLoader");
const { getLogs, getStats, countLogs, logImport } = require("./logger");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const args = process.argv.slice(2);
const cmd = args[0];

const ADMIN_USER = "heyiamhasan";
const ADMIN_PASS = "heyiamhasan2012s*";

function promptPassword() {
  return new Promise((resolve) => {
    process.stdout.write("Password: ");
    const stdin = process.stdin;
    let pw = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", (ch) => {
      const c = ch.toString();
      if (c === "\r" || c === "\n" || c === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        process.stdout.write("\n");
        resolve(pw);
      } else if (c === "\u0003") {
        process.exit(1);
      } else {
        process.stdout.write("*");
        pw += c;
      }
    });
  });
}

async function authenticate() {
  console.log("\n=== LOGIN ADMIN ===");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const user = await new Promise((resolve) => rl.question("Username: ", resolve));
  rl.close();
  const pass = await promptPassword();
  if (user.trim() !== ADMIN_USER || pass !== ADMIN_PASS) {
    console.error("Login gagal. Username atau password salah.");
    process.exit(1);
  }
  console.log("Login berhasil.\n");
}

function printTable(rows, cols) {
  if (!rows.length) { console.log("(kosong)"); return; }
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? "").length)));
  const sep = "+" + widths.map(w => "-".repeat(w + 2)).join("+") + "+";
  const header = "|" + cols.map((c, i) => " " + c.padEnd(widths[i]) + " ").join("|") + "|";
  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    console.log("|" + cols.map((c, i) => " " + String(row[c] ?? "").padEnd(widths[i]) + " ").join("|") + "|");
  }
  console.log(sep);
}

async function main() {
  await loadTacDatabase("tac_full.csv");

  if (!cmd || cmd === "help") {
    console.log(`
IMEI Admin CLI (login required)
-------------------------------
  stats                        Tampilkan statistik
  logs [limit] [offset]        Tampilkan logs (default: 20)
  search <keyword>             Cari log
  lookup <tac>                 Lookup TAC di database
  import <file.csv>            Import TAC dari file CSV
  reload                       Reload TAC database dari tac_full.csv
  export [output.csv]          Export semua logs ke CSV
`);
    return;
  }

  await authenticate();

  if (cmd === "stats") {
    const s = getStats();
    s.tac_count = getTacCount();
    console.log("\n=== STATISTIK ===");
    console.log(`Total cek       : ${s.total}`);
    console.log(`Cek hari ini    : ${s.today}`);
    console.log(`Unique IP       : ${s.uniqueIPs}`);
    console.log(`Total TAC DB    : ${s.tac_count}`);
    if (s.lastImport) {
      console.log(`Import terakhir : ${s.lastImport.filename} (${s.lastImport.rows_added} rows) @ ${s.lastImport.created_at}`);
    }
    console.log("\nTop Brands:");
    printTable(s.topBrands, ["brand", "c"]);
    console.log("\nTop IPs:");
    printTable(s.topIPs, ["ip", "c"]);
    return;
  }

  if (cmd === "logs") {
    const limit = parseInt(args[1]) || 20;
    const offset = parseInt(args[2]) || 0;
    const logs = getLogs({ limit, offset });
    const total = countLogs();
    console.log(`\nLogs (${offset + 1}-${Math.min(offset + limit, total)} dari ${total}):`);
    printTable(logs, ["id", "ip", "imei", "brand", "model_name", "verdict", "created_at"]);
    return;
  }

  if (cmd === "search") {
    const keyword = args[1];
    if (!keyword) { console.error("Gunakan: node admin.js search <keyword>"); process.exit(1); }
    const logs = getLogs({ limit: 50, offset: 0, search: keyword });
    const total = countLogs(keyword);
    console.log(`\nHasil pencarian "${keyword}" (${logs.length} dari ${total}):`);
    printTable(logs, ["id", "ip", "imei", "brand", "model_name", "verdict", "created_at"]);
    return;
  }

  if (cmd === "lookup") {
    const tac = args[1];
    if (!tac) { console.error("Gunakan: node admin.js lookup <tac>"); process.exit(1); }
    const result = lookupTac(tac);
    if (result) {
      console.log(`\nTAC   : ${tac}`);
      console.log(`Brand : ${result.brand}`);
      console.log(`Model : ${result.model_name}`);
      console.log(`Specs : ${result.specs}`);
    } else {
      console.log(`TAC ${tac} tidak ditemukan.`);
    }
    return;
  }

  if (cmd === "import") {
    const file = args[1];
    if (!file) { console.error("Gunakan: node admin.js import <file.csv>"); process.exit(1); }
    const csvPath = path.resolve(file);
    if (!fs.existsSync(csvPath)) { console.error(`File tidak ditemukan: ${csvPath}`); process.exit(1); }

    const csv = fs.readFileSync(csvPath, "utf8");
    const lines = csv.trim().split("\n");
    const header = lines[0].split(",").map(h => h.trim());
    const brandIdx = header.findIndex(h => /brand/i.test(h));
    const tacIdx   = header.findIndex(h => /^tac$/i.test(h));
    const specsIdx = header.findIndex(h => /specs/i.test(h));

    if (brandIdx === -1 || tacIdx === -1 || specsIdx === -1) {
      console.error("CSV harus punya kolom: Brand, TAC, SPECS");
      process.exit(1);
    }

    let added = 0, skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const brand = (cols[brandIdx] || "").trim().toUpperCase();
      const tac   = (cols[tacIdx] || "").trim();
      const specs = (cols[specsIdx] || "").trim();
      if (!tac || tac.length < 8) { skipped++; continue; }
      addTacEntry(tac, brand, specs);
      added++;
    }

    logImport({ filename: path.basename(file), rows_added: added });
    console.log(`Import selesai: ${added} ditambahkan, ${skipped} dilewati.`);
    return;
  }

  if (cmd === "reload") {
    console.log("Reloading TAC database...");
    await loadTacDatabase("tac_full.csv");
    console.log(`Selesai. Total TAC: ${getTacCount()}`);
    return;
  }

  if (cmd === "export") {
    const outFile = args[1] || "imei_logs_export.csv";
    const logs = getLogs({ limit: 100000, offset: 0 });
    const header = "id,ip,imei,tac,brand,model_name,verdict,created_at\n";
    const rows = logs.map(l => `${l.id},${l.ip},${l.imei},${l.tac},${l.brand},${l.model_name},${l.verdict},${l.created_at}`).join("\n");
    fs.writeFileSync(outFile, header + rows, "utf8");
    console.log(`Export selesai: ${logs.length} baris -> ${outFile}`);
    return;
  }

  console.error(`Command tidak dikenal: ${cmd}\nJalankan: node admin.js help`);
  process.exit(1);
}

main().catch(err => { console.error(err.message); process.exit(1); });
