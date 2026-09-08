const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const XLSX = require("xlsx");
const { loadTacDatabase, lookupTac, getTacCount, addTacEntry } = require("./tacLoader");
const { SPECS_DATABASE } = require("./specsDatabase");
const { logCheck, logImport, getLogs, getStats, countLogs } = require("./logger");

const ADMIN_USER = "heyiamhasan";
const ADMIN_PASS = "heyiamhasan2012s*";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(session({
  secret: "imei-tac-secret-key-x9f2k",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// ─── Auth middleware ──────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  if (req.accepts("html")) return res.redirect("/login.html");
  return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Login diperlukan." } });
}

// ─── Login API ────────────────────────────────────────────────────
app.post("/api/v1/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.admin = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Username atau password salah." } });
});

app.post("/api/v1/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Protect admin.html
app.get("/admin.html", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

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
app.get("/api/v1/admin/stats", requireAdmin, (req, res) => {
  const stats = getStats();
  stats.tac_count = getTacCount();
  res.json({ success: true, data: stats });
});

// ─── ADMIN: logs ──────────────────────────────────────────────────
app.get("/api/v1/admin/logs", requireAdmin, (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const search = (req.query.search || "").trim();
  const logs   = getLogs({ limit, offset, search });
  const total  = countLogs(search);
  res.json({ success: true, data: { logs, total, limit, offset } });
});

// ─── ADMIN: import TAC CSV ────────────────────────────────────────
app.post("/api/v1/admin/import", requireAdmin, (req, res) => {
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
app.post("/api/v1/admin/reload", requireAdmin, async (req, res) => {
  try {
    await loadTacDatabase("tac_full.csv");
    const count = getTacCount();
    res.json({ success: true, data: { tac_count: count } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "RELOAD_FAIL", message: err.message } });
  }
});

// ─── ADMIN: export logs ───────────────────────────────────────────
app.get("/api/v1/admin/export", requireAdmin, (req, res) => {
  const logs = getLogs({ limit: 100000, offset: 0 });
  const header = "id,ip,imei,tac,brand,model_name,verdict,created_at\n";
  const rows = logs.map((l) => `${l.id},${l.ip},${l.imei},${l.tac},${l.brand},${l.model_name},${l.verdict},${l.created_at}`).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=imei_logs.csv");
  res.send(header + rows);
});

// ─── ADMIN: import Excel trade-in ────────────────────────────────
app.post("/api/v1/admin/import-excel", requireAdmin, (req, res) => {
  if (!req.body.file) {
    return res.status(400).json({ success: false, error: { code: "NO_DATA", message: "Field 'file' wajib diisi (base64 encoded Excel file)." } });
  }

  try {
    const base64Data = req.body.file;
    const buffer = Buffer.from(base64Data, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: { code: "EMPTY", message: "Excel kosong atau tidak ada data." } });
    }

    // Map header yang flexible (cari kolom IMEI, Merk/Brand, Tipe/Model/Type)
    const firstRow = rows[0];
    const keys = Object.keys(firstRow);

    // Cari kolom IMEI
    const imeiKey = keys.find((k) => /imei/i.test(k));
    // Cari kolom Merk/Brand
    const merkKey = keys.find((k) => /merk|brand/i.test(k));
    // Cari kolom Tipe/Model/Type
    const tipeKey = keys.find((k) => /tipe|tipe|model|type/i.test(k));
    // Cari kolom Storage
    const storageKey = keys.find((k) => /storage|rom|memor/i.test(k));

    if (!imeiKey) {
      return res.status(400).json({ success: false, error: { code: "BAD_HEADER", message: "Kolom IMEI tidak ditemukan di Excel. Pastikan ada kolom yang mengandung kata 'IMEI'." } });
    }

    const results = {
      total: rows.length,
      match: [],
      not_found: [],
      refurbish_suspect: [],
      need_verify: [],
      invalid_imei: [],
    };

    rows.forEach((row, idx) => {
      const imeiRaw = String(row[imeiKey] || "").trim();
      const excelMerk = String(row[merkKey] || "").trim();
      const excelTipe = String(row[tipeKey] || "").trim();
      const excelStorage = storageKey ? String(row[storageKey] || "").trim() : "";

      // Validasi IMEI format
      if (!imeiRaw || !/^\d{15}$/.test(imeiRaw)) {
        results.invalid_imei.push({
          row: idx + 2,
          imei: imeiRaw,
          merk: excelMerk,
          tipe: excelTipe,
          reason: "Format IMEI tidak valid (harus 15 digit angka)",
        });
        return;
      }

      // Validasi Luhn checksum
      if (!luhnCheck(imeiRaw)) {
        results.invalid_imei.push({
          row: idx + 2,
          imei: imeiRaw,
          merk: excelMerk,
          tipe: excelTipe,
          reason: "Gagal validasi checksum Luhn (IMEI tidak valid)",
        });
        return;
      }

      const tac = imeiRaw.substring(0, 8);
      const tacData = lookupTac(tac);

      if (!tacData) {
        // Jangan auto-add jika merk/tipe tidak valid (kosong, -, atau kata non-device)
      const invalidMerkTipe = /^[-\s]*$|^reguler$|^unit$|^only$|^box$/i;
      const merkValid = excelMerk && !invalidMerkTipe.test(excelMerk.trim());
      const tipeValid = excelTipe && !invalidMerkTipe.test(excelTipe.trim());
      if (merkValid && tipeValid) {
        const specStr = `${excelMerk.toUpperCase()} ${excelTipe.toUpperCase()}`;
        addTacEntry(tac, excelMerk, specStr);
      }
      results.not_found.push({
        row: idx + 2,
        imei: imeiRaw,
        tac: tac,
        merk_excel: excelMerk,
        tipe_excel: excelTipe,
        auto_added: !!(merkValid && tipeValid),
      });
        return;
      }

      const tacBrand = tacData.brand;
      const tacModel = tacData.modelName;
      const tacFullSpecs = tacData.fullSpecs || "";

      // Normalize: uppercase, hilangkan spasi & tanda baca, PLUS -> +
      const normalize = (s) => s.toUpperCase()
        .replace(/\bPLUS\b/g, "+")
        .replace(/[\s\-_.,()]/g, "");

      // Token match: semua kata penting dari Excel ada di fullSpecs TAC
      // Abaikan token konektivitas yang sering tidak ada di TAC
      const ignoredTokens = new Set(["5G", "4G", "3G", "LTE", "WIFI", "5GE"]);
      const tokenMatch = (excelStr, fullSpecs) => {
        const tokens = excelStr.toUpperCase().replace(/\bPLUS\b/g, "+").split(/\s+/).filter(t => t && !ignoredTokens.has(t));
        const normSpecs = fullSpecs.toUpperCase().replace(/\bPLUS\b/g, "+").replace(/[\s\-_.,()]/g, "");
        return tokens.length > 0 && tokens.every(t => normSpecs.includes(t.replace(/[\s\-_.,()]/g, "")));
      };

      const normExcelMerk = normalize(excelMerk);
      const normTacBrand = normalize(tacBrand);
      const normExcelTipe = normalize(excelTipe);
      const normTacModel = normalize(tacModel);
      const normFullSpecs = normalize(tacFullSpecs);

      // Brand cocok jika ada di brand TAC atau di full specs TAC
      const brandMatch = !normExcelMerk ||
        normTacBrand.includes(normExcelMerk) ||
        normExcelMerk.includes(normTacBrand) ||
        normFullSpecs.includes(normExcelMerk);

      // Model cocok: substring match ATAU semua token Excel ada di fullSpecs TAC
      const modelMatch = !normExcelTipe ||
        normTacModel.includes(normExcelTipe) ||
        normExcelTipe.includes(normTacModel) ||
        normFullSpecs.includes(normExcelTipe) ||
        tokenMatch(excelTipe, tacFullSpecs);

      if (!brandMatch || !modelMatch) {
        // Huawei & brand yang sering beda format → masuk need_verify, bukan refurbish
        const verifyBrands = ["HUAWEI", "HONOR"];
        if (verifyBrands.includes(tacBrand.toUpperCase())) {
          results.need_verify.push({
            row: idx + 2,
            imei: imeiRaw,
            tac: tac,
            merk_excel: excelMerk,
            tipe_excel: excelTipe,
            merk_tac: tacBrand,
            tipe_tac: tacModel,
            full_specs_tac: tacData.fullSpecs,
          });
        } else {
          results.refurbish_suspect.push({
            row: idx + 2,
            imei: imeiRaw,
            tac: tac,
            merk_excel: excelMerk,
            tipe_excel: excelTipe,
            merk_tac: tacBrand,
            tipe_tac: tacModel,
            full_specs_tac: tacData.fullSpecs,
          });
        }
      } else {
        results.match.push({
          row: idx + 2,
          imei: imeiRaw,
          tac: tac,
          merk_excel: excelMerk,
          tipe_excel: excelTipe,
          merk_tac: tacBrand,
          tipe_tac: tacModel,
        });
      }
    });

    return res.json({ success: true, data: results });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: "PARSE_ERROR", message: "Gagal membaca file Excel: " + err.message } });
  }
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
