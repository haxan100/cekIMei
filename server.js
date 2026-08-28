const express = require("express");
const { loadTacDatabase, lookupTac } = require("./tacLoader");
const { SPECS_DATABASE } = require("./specsDatabase");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

app.post("/api/v1/check-imei", (req, res) => {
  const { imei, claimed_ram, claimed_rom } = req.body;

  if (!imei) {
    return res.status(400).json({
      success: false,
      error: {
        code: "MISSING_IMEI",
        message: "Field 'imei' wajib diisi.",
      },
    });
  }

  const imeiStr = String(imei).trim();

  if (!luhnCheck(imeiStr)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_IMEI",
        message:
          "Format IMEI tidak valid atau gagal pada validasi Checksum Luhn.",
      },
    });
  }

  const tac = imeiStr.substring(0, 8);
  const tacData = lookupTac(tac);

  if (!tacData) {
    return res.status(404).json({
      success: false,
      error: {
        code: "TAC_NOT_FOUND",
        message: `TAC ${tac} tidak ditemukan pada database. Data perangkat tidak dapat diverifikasi.`,
      },
    });
  }

  const brand = tacData.brand;
  const modelName = tacData.modelName;
  const modelCode = tacData.modelCode;

  const modelSpecs = findModelSpecs(brand, modelName);

  const claimedRam = claimed_ram != null ? Number(claimed_ram) : null;
  const claimedRom = claimed_rom != null ? Number(claimed_rom) : null;

  const reasons = [];
  let isRefurbishedFake = false;

  let maxRam = null;
  let maxStorage = null;
  let standardVariants = [];
  let blacklistCodes = [];

  if (modelSpecs) {
    maxRam = modelSpecs.max_ram;
    maxStorage = modelSpecs.max_storage;
    standardVariants = modelSpecs.standard_variants || [];
    blacklistCodes = modelSpecs.blacklist_codes || [];

    if (claimedRam != null && maxRam != null && claimedRam > maxRam) {
      isRefurbishedFake = true;
      reasons.push(
        `Klaim RAM ${claimedRam} GB melebihi batas hardware maksimum pabrikan (Maks: ${maxRam} GB).`
      );
    }

    if (claimedRom != null && maxStorage != null && claimedRom > maxStorage) {
      isRefurbishedFake = true;
      reasons.push(
        `Klaim Storage ${claimedRom} GB melebihi batas maksimum model ini (Maks: ${maxStorage} GB).`
      );
    }

    if (modelCode && blacklistCodes.length > 0) {
      const matchedBlacklist = blacklistCodes.find(
        (c) => c.toUpperCase() === modelCode.toUpperCase()
      );
      if (matchedBlacklist) {
        isRefurbishedFake = true;
        reasons.push(
          `Kode model ${matchedBlacklist} teridentifikasi sebagai varian distributor rekondisi.`
        );
      }
    }
  } else {
    reasons.push(
      `Model '${modelName}' tidak ditemukan dalam database spesifikasi referensi. Verifikasi manual disarankan.`
    );
  }

  const riskLevel = isRefurbishedFake ? "HIGH" : "LOW";
  const verdict = isRefurbishedFake
    ? "BAHAYA: Unit Refurbish / Spek Dimanipulasi"
    : "AMAN: Spesifikasi Sesuai Standar Pabrik";

  return res.json({
    success: true,
    data: {
      imei: imeiStr,
      tac: tac,
      device_info: {
        brand: brand,
        model_name: modelName,
        model_code: modelCode || "",
      },
      claimed_specs: {
        ram: claimedRam != null ? `${claimedRam} GB` : "Tidak diklaim",
        storage: claimedRom != null ? `${claimedRom} GB` : "Tidak diklaim",
      },
      official_limits: modelSpecs
        ? {
            max_ram: `${maxRam} GB`,
            max_storage: `${maxStorage} GB`,
            standard_variants: standardVariants,
          }
        : {
            max_ram: "N/A",
            max_storage: "N/A",
            standard_variants: [],
          },
      assessment: {
        is_refurbished_fake: isRefurbishedFake,
        risk_level: riskLevel,
        verdict: verdict,
        reasons: reasons,
      },
    },
  });
});

app.get("/api/v1/tac/:tac", (req, res) => {
  const tac = req.params.tac.trim();
  if (!/^\d{8}$/.test(tac)) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_TAC",
        message: "TAC harus berupa 8 digit angka.",
      },
    });
  }
  const tacData = lookupTac(tac);
  if (!tacData) {
    return res.status(404).json({
      success: false,
      error: {
        code: "TAC_NOT_FOUND",
        message: `TAC ${tac} tidak ditemukan pada database.`,
      },
    });
  }
  return res.json({
    success: true,
    data: {
      tac: tac,
      brand: tacData.brand,
      model_name: tacData.modelName,
      model_code: tacData.modelCode || "",
      full_specs: tacData.fullSpecs,
    },
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

async function start() {
  console.log("[Startup] Loading TAC database...");
  await loadTacDatabase("tac_full.csv");
  app.listen(PORT, () => {
    console.log(`[Server] IMEI TAC Checker API running on http://localhost:${PORT}`);
  });
}

start();
