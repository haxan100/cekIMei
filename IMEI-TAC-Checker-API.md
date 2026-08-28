# 📱 IMEI TAC & Fake Spec Refurbish Checker API

REST API ringan dan cepat untuk memverifikasi keaslian spesifikasi perangkat seluler berdasarkan 8 digit awal IMEI (**Type Allocation Code / TAC**) menggunakan database publik offline.

API ini berguna untuk mendeteksi unit HP *refurbished* yang telah dimodifikasi sistemnya (*fake RAM/ROM*) sebelum transaksi jual-beli.

---

## 🚀 Fitur Utama

- **Offline TAC Resolution:** Memetakan 15 digit IMEI ke Brand dan Model asli menggunakan database TAC.
- **Validasi Algoritma Luhn:** Memverifikasi checksum 15 digit IMEI sebelum pemrosesan.
- **Rule Engine Anti-Fake Spec:** Membandingkan klaim RAM/Storage dari penjual dengan batas spesifikasi maksimum resmi pabrikan.
- **Deteksi Flag Refurbish:** Memberikan sinyal peringatan risiko jika spesifikasi melebihi batas hardware pabrik atau menggunakan model mesin rekondisi (misal: Oppo China PBAM00).

---

## 🗄️ Sumber Database

Dataset TAC diambil dari repositori publik:

- **URL CSV:** `https://raw.githubusercontent.com/MoazEb/tac-database/refs/heads/main/tac_full.csv`
- Disimpan dan di-load ke dalam memory/SQLite lokal untuk performa query 0 ms tanpa biaya API eksternal.

---

## 🛠️ Panduan Instalasi & Menjalankan

### 1. Prasyarat

- Python 3.9+ / Node.js / Go
- File `tac_full.csv` yang sudah diunduh ke folder root aplikasi

```bash
# Unduh dataset TAC
curl -O https://raw.githubusercontent.com/MoazEb/tac-database/refs/heads/main/tac_full.csv
```

### 2. Instalasi Dependensi (contoh Node.js/Express)

```bash
npm init -y
npm install express csv-parser better-sqlite3
```

### 3. Menjalankan Server

```bash
node server.js
# Server berjalan di http://localhost:3000
```

---

## 📡 Endpoint

### `POST /api/v1/check-imei`

Memeriksa IMEI, melakukan lookup TAC, dan mengevaluasi kecocokan spesifikasi klaim terhadap batas resmi pabrikan.

**Headers**

```
Content-Type: application/json
```

**Contoh Body**

```json
{
  "imei": "868123049182391",
  "claimed_ram": 8,
  "claimed_rom": 128
}
```

| Field         | Tipe   | Wajib | Keterangan                                  |
|---------------|--------|-------|----------------------------------------------|
| `imei`        | string | Ya    | 15 digit nomor IMEI perangkat                |
| `claimed_ram` | number | Tidak | Klaim kapasitas RAM (GB) dari penjual/listing |
| `claimed_rom` | number | Tidak | Klaim kapasitas storage (GB) dari penjual/listing |

---

## 📤 Contoh Response

### 1. Kasus Terdeteksi Palsu / Refurbished Modif (Status: `HIGH_RISK_FAKE`)

```json
{
  "success": true,
  "data": {
    "imei": "868123049182391",
    "tac": "86812304",
    "device_info": {
      "brand": "OPPO",
      "model_name": "A3s",
      "model_code": "PBAM00"
    },
    "claimed_specs": {
      "ram": "8 GB",
      "storage": "128 GB"
    },
    "official_limits": {
      "max_ram": "3 GB",
      "max_storage": "32 GB",
      "standard_variants": ["2/16 GB", "3/32 GB"]
    },
    "assessment": {
      "is_refurbished_fake": true,
      "risk_level": "HIGH",
      "verdict": "BAHAYA: Unit Refurbish / Spek Dimanipulasi",
      "reasons": [
        "Klaim RAM 8 GB melebihi batas hardware maksimum pabrikan (Maks: 3 GB).",
        "Klaim Storage 128 GB melebihi batas maksimum model ini (Maks: 32 GB).",
        "Kode model PBAM00 teridentifikasi sebagai varian distributor rekondisi."
      ]
    }
  }
}
```

### 2. Kasus Perangkat Asli / Sesuai Standar (Status: `OFFICIAL_MATCH`)

```json
{
  "success": true,
  "data": {
    "imei": "867541031234567",
    "tac": "86754103",
    "device_info": {
      "brand": "VIVO",
      "model_name": "Y17",
      "model_code": "1902"
    },
    "claimed_specs": {
      "ram": "4 GB",
      "storage": "128 GB"
    },
    "official_limits": {
      "max_ram": "4 GB",
      "max_storage": "128 GB",
      "standard_variants": ["4/128 GB"]
    },
    "assessment": {
      "is_refurbished_fake": false,
      "risk_level": "LOW",
      "verdict": "AMAN: Spesifikasi Sesuai Standar Pabrik",
      "reasons": []
    }
  }
}
```

### 3. Kasus Format IMEI Tidak Valid

```json
{
  "success": false,
  "error": {
    "code": "INVALID_IMEI",
    "message": "Format IMEI tidak valid atau gagal pada validasi Checksum Luhn."
  }
}
```

### 4. Kasus TAC Tidak Ditemukan di Database

```json
{
  "success": false,
  "error": {
    "code": "TAC_NOT_FOUND",
    "message": "TAC 86812304 tidak ditemukan pada database. Data perangkat tidak dapat diverifikasi."
  }
}
```

---

## ⚙️ Logika Deteksi (Rule Engine)

Sistem menggunakan matriks spesifikasi maksimum resmi untuk tipe-tipe rawan rekondisi:

```
[Input IMEI 15 Digit]
       │
       ├─► [1. Validasi Luhn Checksum] ──(Gagal)──► Return Error Invalid IMEI
       │
       ▼
[2. Ekstrak 8 Digit TAC]
       │
       ├─► [3. Lookup TAC di CSV / Memory Cache]
       │       └─ Mendapatkan Brand & Model Asli
       │
       ▼
[4. Evaluasi terhadap Rule Engine]
       │
       ├─ Jika claimed_ram > max_official_ram   ──► Flag: is_refurbished_fake = true
       ├─ Jika claimed_rom > max_official_rom   ──► Flag: is_refurbished_fake = true
       └─ Jika model_code masuk blacklist modif  ──► Flag: is_refurbished_fake = true
       │
       ▼
[5. Return JSON Verdict]
```

---

## 🧩 Catatan Implementasi

- **Batas spesifikasi resmi per model** (max RAM/ROM, standard variants, blacklist model code) tidak tersedia otomatis dari dataset TAC publik — perlu tabel referensi tambahan yang dikurasi manual per brand/model, karena TAC hanya memetakan ke brand & model, bukan varian RAM/ROM resmi.
- **Algoritma Luhn** wajib diterapkan sebelum lookup untuk mencegah query sia-sia pada IMEI yang jelas tidak valid.
- Untuk performa produksi, load `tac_full.csv` ke SQLite/in-memory index (misal Map berbasis TAC sebagai key) saat startup, bukan membaca file per-request.
- Pertimbangkan endpoint tambahan `GET /api/v1/tac/:tac` untuk lookup brand/model saja tanpa evaluasi spesifikasi.

---

## 🔒 Lisensi

Distribusi data TAC berada di bawah lisensi open-source repositori publik `MoazEb/tac-database`.
