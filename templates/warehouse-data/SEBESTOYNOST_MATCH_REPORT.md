# Sebestoynost 500kW Z-Series — catalog match report

Compared Excel BOM lines to `WH_data_reorganised_updated.json` (MoneyWorks reorg catalog).

| Metric | Count |
|--------|------:|
| Excel unique lines | 310 |
| Matched by exact name | 112 |
| Matched by fuzzy name | 38 |
| Unmatched (created on seed) | 160 |
| Matched by SKU in reorg file | 0 |

SKU codes in the Excel often differ from MoneyWorks article codes (spacing / formatting), so live warehouse matching prefers **SKU then exact name**. When you seed after a MoneyWorks import, more items will match existing catalog rows.

Full machine-readable list: `_sebestoynost_match_report.json`.

Seed file: `sebestoynost-500kw-z-series-seed.json` (8 modules, 30 subgroups, €223,986.94 ex VAT).
