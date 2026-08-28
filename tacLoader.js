const fs = require("fs");
const csv = require("csv-parser");

const tacMap = new Map();

function loadTacDatabase(filePath = "tac_full.csv") {
  return new Promise((resolve, reject) => {
    let count = 0;
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        const tac = (row.TAC || "").trim();
        const brand = (row.Brand || "").trim().toUpperCase();
        const specs = (row.SPECS || "").trim();

        if (!tac || tac.length < 8) return;

        let modelName = "";
        let modelCode = "";

        const specsUpper = specs.toUpperCase();

        if (brand === "XIAOMI") {
          const m = specs.match(/XIAOMI\s+(.+?)(?:,|$)/);
          if (m) modelName = m[1].trim();
          const mc = specs.match(/Xiaomi\s+([A-Z0-9]+)/i);
          if (mc) modelCode = mc[1].trim();
        } else if (brand === "OPPO") {
          const m = specs.match(/OPPO\s+(.+?)(?:,|$)/);
          if (m) modelName = m[1].trim();
          const mc = specs.match(/\b(CPH\d{4}|PBAM\d{2})/);
          if (mc) modelCode = mc[1].toUpperCase().trim();
        } else if (brand === "VIVO") {
          const m = specs.match(/VIVO\s+(.+?)(?:,|$)/);
          if (m) modelName = m[1].trim();
          const mc = specs.match(/\b(\d{4})\b/);
          if (mc) modelCode = mc[1].trim();
        } else if (brand === "SAMSUNG") {
          const m = specs.match(/SAMSUNG\s+(.+?)(?:,|$)/);
          if (m) modelName = m[1].trim();
          const mc = specs.match(/\b(SM-[A-Z0-9]+)\b/i);
          if (mc) modelCode = mc[1].toUpperCase().trim();
        } else if (brand === "REALME") {
          const m = specs.match(/REALME\s+(.+?)(?:,|$)/);
          if (m) modelName = m[1].trim();
          const mc = specs.match(/\b(RMX\d+)\b/i);
          if (mc) modelCode = mc[1].toUpperCase().trim();
        } else if (brand === "INFINIX") {
          const m = specs.match(/INFINIX\s+(.+?)(?:,|$)/);
          if (m) modelName = m[1].trim();
          const mc = specs.match(/\b(X\d+)\b/i);
          if (mc) modelCode = mc[1].toUpperCase().trim();
        } else if (brand === "TECNO") {
          const m = specs.match(/TECNO\s+(.+?)(?:,|$)/);
          if (m) modelName = m[1].trim();
          const mc = specs.match(/\b(CK\d|KD\d|KC\d)\b/i);
          if (mc) modelCode = mc[1].toUpperCase().trim();
        } else {
          const m = specs.match(/(?:^|,)\s*([^,]+?)$/);
          if (m) modelName = m[1].trim();
        }

        tacMap.set(tac, { brand, modelName, modelCode, fullSpecs: specs });
        count++;
      })
      .on("end", () => {
        console.log(`[TAC DB] Loaded ${count} TAC entries into memory.`);
        resolve(count);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

function lookupTac(tac) {
  return tacMap.get(tac) || null;
}

module.exports = { loadTacDatabase, lookupTac };
