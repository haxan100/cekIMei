const express = require("express");
const fs = require("fs");
const path = require("path");
const { loadTacDatabase, lookupTac, getTacCount, addTacEntry } = require("./tacLoader");
const { SPECS_DATABASE } = require("./specsDatabase");
const { logCheck, logImport, getLogs, getStats, countLogs } = require("./logger");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

function luhnCheck(imei) {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = imei.length - 1; i >= 0; i--) {
    let digit = parseInt(imei[i], 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function findModelSpecs(brand, modelName) {
  if (!brand || !modelName) return null;
  const brandData = SPECS_DATABASE[brand];
  if (!brandData) return null;
  const modelUpper = modelName.toUpperCase().trim();
  for (const key of Object.keys(brandData)) {
    if (modelUpper.includes(key.toUpperCase())) {
      return { modelKey: key, ...brandData[key] };
    }
  }
  return null;
}

// ─── IMEI CHECK (public) ───────────────────────────────────────────
app.post("/api/v1/check-imei", (req, res) => {
  const { imei, claimed_ram, claimed_rom } = req.body;

  if (!imei) {
    return res.status(400).json({ success: false, error: { code: "MISSING_IMEI", message: "Field 'imei' wajib diisi." } });
  }

  const imeiStr = String(imei).trim();

  if (!luhnCheck(imeiStr)) {
    return res.status(400).json({ success: false, error: { code: "INVALID_IMEI", message: "Format IMEI tidak valid atau gagal pada validasi Checksum Luhn." } });
  }

  const tac = imeiStr.substring(0, 8);
  const tacData = lookupTac(tac);

  if (!tacData) {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    logCheck({ ip, imei: imeiStr, tac, brand: "", model_name: "", verdict: "TAC_NOT_FOUND" });
    return res.status(404).json({ success: false, error: { code: "TAC_NOT_FOUND", message: `TAC ${tac} tidak ditemukan pada database. Data perangkat tidak dapat diverifikasi.` } });
  }

  const brand = tacData.brand;
  const modelName = tacData.modelName;
  const modelCode = tacData.modelCode;
  const modelSpecs = findModelSpecs(brand, modelName);
  const claimedRam = claimed_ram != null ? Number(claimed_ram) : null;
  const claimedRom = claimed_rom != null ? Number(claimed_rom) : null;
  const reasons = [];
  let isRefurbishedFake = false;
  let maxRam = null, maxStorage = null, standardVariants = [], blacklistCodes = [];

  if (modelSpecs) {
    maxRam = modelSpecs.max_ram;
    maxStorage = modelSpecs.max_storage;
    standardVariants = modelSpecs.standard_variants || [];
    blacklistCodes = modelSpecs.blacklist_codes || [];
    if (claimedRam != null && maxRam != null && claimedRam > maxRam) { isRefurbishedFake = true; reasons.push(`Klaim RAM ${claimedRam} GB melebihi batas hardware maksimum pabrikan (Maks: ${maxRam} GB).`); }
    if (claimedRom != null && maxStorage != null && claimedRom > maxStorage) { isRefurbishedFake = true; reasons.push(`Klaim Storage ${claimedRom} GB melebihi batas maksimum model ini (Maks: ${maxStorage} GB).`); }
    if (modelCode && blacklistCodes.length > 0) {
      const matchedBlacklist = blacklistCodes.find((c) => c.toUpperCase() === modelCode.toUpperCase());
      if (matchedBlacklist) { isRefurbishedFake = true; reasons.push(`Kode model ${matchedBlacklist} teridentifikasi sebagai varian distributor rekondisi.`); }
    }
  } else {
    reasons.push(`Model '${modelName}' tidak ditemukan dalam database spesifikasi referensi. Verifikasi manual disarankan.`);
  }

  const riskLevel = isRefurbishedFake ? "HIGH" : "LOW";
  const verdict = isRefurbishedFake ? "BAHAYA: Unit Refurbish / Spek Dimanipulasi" : "AMAN: Spesifikasi Sesuai Standar Pabrik";

  // Log this check
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  logCheck({ ip, imei: imeiStr, tac, brand, model_name: modelName, verdict });

  return res.json({
    success: true,
    data: {
      imei: imeiStr,
      tac: tac,
      device_info: { brand, model_name: modelName, model_code: modelCode || "" },
      claimed_specs: { ram: claimedRam != null ? `${claimedRam} GB` : "Tidak diklaim", storage: claimedRom != null ? `${claimedRom} GB` : "Tidak diklaim" },
      official_limits: modelSpecs ? { max_ram: `${maxRam} GB`, max_storage: `${maxStorage} GB`, standard_variants: standardVariants } : { max_ram: "N/A", max_storage: "N/A", standard_variants: [] },
      assessment: { is_refurbished_fake: isRefurbishedFake, risk_level: riskLevel, verdict, reasons },
    },
  });
});

// ─── TAC lookup (public) ──────────────────────────────────────────
app.get("/api/v1/tac/:tac", (req, res) => {
  const tac = req.params.tac.trim();
  if (!/^\d{8}$/.test(tac)) { return res.status(400).json({ success: false, error: { code: "INVALID_TAC", message: "TAC harus berupa 8 digit angka." } }); }
  const tacData = lookupTac(tac);
  if (!tacData) { return res.status(404).json({ success: false, error: { code: "TAC_NOT_FOUND", message: `TAC ${tac} tidak ditemukan pada database.` } }); }
  return res.json({ success: true, data: { tac, brand: tacData.brand, model_name: tacData.modelName, model_code: tacData.modelCode || "", full_specs: tacData.fullSpecs } });
});

// ─── ADMIN: stats ─────────────────────────────────────────────────
app.get("/api/v1/admin/stats", (req, res) => {
  const stats = getStats();
  stats.tac_count = getTacCount();
  res.json({ success: true, data: stats });
});

// ─── ADMIN: logs ──────────────────────────────────────────────────
app.get("/api/v1/admin/logs", (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const search = (req.query.search || "").trim();
  const logs   = getLogs({ limit, offset, search });
  const total  = countLogs(search);
  res.json({ success: true, data: { logs, total, limit, offset } });
});

// ─── ADMIN: import TAC CSV ────────────────────────────────────────
app.post("/api/v1/admin/import", (req, res) => {
  if (!req.body.csv) {
    return res.status(400).json({ success: false, error: { code: "NO_DATA", message: "Field 'csv' wajib diisi (CSV string)." } });
  }

  const lines = req.body.csv.trim().split("\n");
  if (lines.length < 2) {
    return res.status(400).json({ success: false, error: { code: "EMPTY", message: "CSV kosong atau tidak ada data." } });
  }

  const header = lines[0].split(",").map((h) => h.trim());
  const brandIdx  = header.findIndex((h) => /brand/i.test(h));
  const tacIdx    = header.findIndex((h) => /^tac$/i.test(h));
  const specsIdx  = header.findIndex((h) => /specs/i.test(h));

  if (brandIdx === -1 || tacIdx === -1 || specsIdx === -1) {
    return res.status(400).json({ success: false, error: { code: "BAD_HEADER", message: "CSV harus punya kolom: Brand, TAC, SPECS" } });
  }

  let added = 0;
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const brand = (cols[brandIdx] || "").trim().toUpperCase();
    const tac   = (cols[tacIdx] || "").trim();
    const specs = (cols[specsIdx] || "").trim();
    if (!tac || tac.length < 8) { skipped++; continue; }
    addTacEntry(tac, brand, specs);
    added++;
  }

  logImport({ filename: req.body.filename || "manual_input", rows_added: added });

  res.json({ success: true, data: { added, skipped, total_lines: lines.length - 1 } });
});

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { result.push(current); current = ""; continue; }
    current += ch;
  }
  result.push(current);
  return result;
}

// ─── ADMIN: reload TAC DB ────────────────────────────────────────
app.post("/api/v1/admin/reload", async (req, res) => {
  try {
    await loadTacDatabase("tac_full.csv");
    const count = getTacCount();
    res.json({ success: true, data: { tac_count: count } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "RELOAD_FAIL", message: err.message } });
  }
});

// ─── ADMIN: export logs ───────────────────────────────────────────
app.get("/api/v1/admin/export", (req, res) => {
  const logs = getLogs({ limit: 100000, offset: 0 });
  const header = "id,ip,imei,tac,brand,model_name,verdict,created_at\n";
  const rows = logs.map((l) => `${l.id},${l.ip},${l.imei},${l.tac},${l.brand},${l.model_name},${l.verdict},${l.created_at}`).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=imei_logs.csv");
  res.send(header + rows);
});

// ─── Health ───────────────────────────────────────────────────────
app.get("/health", (req, res) => { res.json({ status: "ok" }); });

async function start() {
  console.log("[Startup] Loading TAC database...");
  await loadTacDatabase("tac_full.csv");
  await app.listen(PORT);
  console.log(`[Server] IMEI TAC Checker API running on http://localhost:${PORT}`);
}

start();
