const SPECS_DATABASE = {
  "OPPO": {
    "A3s": {
      max_ram: 3,
      max_storage: 32,
      standard_variants: ["2/16 GB", "3/32 GB"],
      blacklist_codes: ["PBAM00"]
    },
    "A5s": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["2/32 GB", "3/32 GB", "4/64 GB"],
      blacklist_codes: ["CPH1909"]
    },
    "A1k": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/32 GB", "4/64 GB"],
      blacklist_codes: ["CPH1803"]
    },
    "F1s": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/32 GB", "4/64 GB"],
      blacklist_codes: ["CPH1609"]
    },
    "A3": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/64 GB", "4/64 GB"],
      blacklist_codes: ["CPH1805"]
    },
    "A5": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/64 GB", "4/64 GB"],
      blacklist_codes: ["CPH1803", "PBAM00"]
    }
  },
  "VIVO": {
    "Y17": {
      max_ram: 4,
      max_storage: 128,
      standard_variants: ["4/128 GB"],
      blacklist_codes: []
    },
    "Y15": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/64 GB", "4/64 GB"],
      blacklist_codes: ["1907"]
    },
    "Y12": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/64 GB", "4/64 GB"],
      blacklist_codes: ["1920"]
    },
    "Y11": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/64 GB", "4/64 GB"],
      blacklist_codes: ["1933"]
    },
    "Y93": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/64 GB", "4/64 GB"],
      blacklist_codes: ["1820"]
    }
  },
  "SAMSUNG": {
    "Galaxy A10": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["2/32 GB", "3/32 GB"],
      blacklist_codes: []
    },
    "Galaxy A11": {
      max_ram: 3,
      max_storage: 64,
      standard_variants: ["2/32 GB", "3/32 GB"],
      blacklist_codes: []
    },
    "Galaxy A12": {
      max_ram: 6,
      max_storage: 128,
      standard_variants: ["3/32 GB", "4/64 GB", "6/128 GB"],
      blacklist_codes: []
    },
    "Galaxy A21s": {
      max_ram: 6,
      max_storage: 128,
      standard_variants: ["3/32 GB", "4/64 GB", "6/128 GB"],
      blacklist_codes: []
    }
  },
  "XIAOMI": {
    "REDMI 4A": {
      max_ram: 3,
      max_storage: 32,
      standard_variants: ["2/16 GB", "3/32 GB"],
      blacklist_codes: []
    },
    "REDMI 5A": {
      max_ram: 3,
      max_storage: 32,
      standard_variants: ["2/16 GB", "3/32 GB"],
      blacklist_codes: []
    },
    "REDMI 5 PLUS": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["2/16 GB", "3/32 GB", "4/64 GB"],
      blacklist_codes: []
    },
    "REDMI 6A": {
      max_ram: 3,
      max_storage: 32,
      standard_variants: ["2/16 GB", "3/32 GB"],
      blacklist_codes: []
    },
    "REDMI 6 PRO": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/32 GB", "4/64 GB"],
      blacklist_codes: []
    },
    "REDMI NOTE 7": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/32 GB", "4/64 GB"],
      blacklist_codes: []
    },
    "REDMI NOTE 8": {
      max_ram: 6,
      max_storage: 128,
      standard_variants: ["4/64 GB", "6/128 GB"],
      blacklist_codes: []
    },
    "REDMI NOTE 9": {
      max_ram: 6,
      max_storage: 128,
      standard_variants: ["4/64 GB", "6/128 GB"],
      blacklist_codes: []
    }
  },
  "REALME": {
    "C1": {
      max_ram: 3,
      max_storage: 32,
      standard_variants: ["2/16 GB", "3/32 GB"],
      blacklist_codes: []
    },
    "C2": {
      max_ram: 3,
      max_storage: 32,
      standard_variants: ["2/16 GB", "3/32 GB"],
      blacklist_codes: ["RMX1941"]
    },
    "C3": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["3/32 GB", "4/64 GB"],
      blacklist_codes: ["RMX1941"]
    },
    "5i": {
      max_ram: 4,
      max_storage: 128,
      standard_variants: ["4/64 GB", "4/128 GB"],
      blacklist_codes: ["RMX1931"]
    }
  },
  "INFINIX": {
    "HOT 8": {
      max_ram: 4,
      max_storage: 64,
      standard_variants: ["2/32 GB", "4/64 GB"],
      blacklist_codes: ["X650"]
    },
    "HOT 9": {
      max_ram: 4,
      max_storage: 128,
      standard_variants: ["4/64 GB", "4/128 GB"],
      blacklist_codes: ["X655"]
    },
    "SMART 4": {
      max_ram: 2,
      max_storage: 32,
      standard_variants: ["1/16 GB", "2/32 GB"],
      blacklist_codes: ["X412"]
    },
    "HOT 10 PLAY": {
      max_ram: 4,
      max_storage: 128,
      standard_variants: ["2/32 GB", "4/64 GB", "4/128 GB"],
      blacklist_codes: ["X688"]
    }
  },
  "TECNO": {
    "SPARK 4": {
      max_ram: 3,
      max_storage: 32,
      standard_variants: ["2/16 GB", "3/32 GB"],
      blacklist_codes: ["KC6"]
    },
    "SPARK 5": {
      max_ram: 3,
      max_storage: 32,
      standard_variants: ["2/16 GB", "3/32 GB"],
      blacklist_codes: ["KD7"]
    },
    "CAMON 15": {
      max_ram: 4,
      max_storage: 128,
      standard_variants: ["4/64 GB", "4/128 GB"],
      blacklist_codes: ["CK8"]
    }
  }
};

module.exports = { SPECS_DATABASE };
