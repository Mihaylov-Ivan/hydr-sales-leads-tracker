# Warehouse reorganisation — change report (draft)

**Decisions locked**
1. Tools **A** — one SKU, stock broken down by location  
2. Vendors **A** — category = what it is; supplier = field  
3. Systems **A** — type categories + `system_tags` (electrolyzer, scrubber, gas-analyzer, metal-hydride, water-treatment, …)

**Status:** Draft data files only. No database write yet. Every article keeps `source_refs` (old group + name + code) so nothing is lost.

## Outputs

| File | Purpose |
|------|---------|
| `WH_data_reorganised_updated.json` | New taxonomy + reorganised articles |
| `WH_reorg_mapping_updated.json` | Full old→new group mapping + samples |
| `WH_reorg_change_report_updated.json` | Machine-readable change log |
| `_build_reorg.mjs` | Rebuild script (re-runnable) |

## What changed (conceptually)

### Category tree (new)
Stable sort codes, type-only:

- **01** Piping & fluid (pipes, weld/thread fittings, flanges, valves, actuators, PP/brass/chrome, hoses)
- **02** Fasteners (bolts/screws, nuts, washers, other) — `М3`…`М16` collapsed; size kept as `fastener_size`
- **03** Electrical (cables, terminals, glands/lugs, channels, PSUs, PCBs, other)
- **04** Sensors & devices (+ gas-analyzer panel parts leaf)
- **05** Process assemblies (electrolyzer / scrubber / MH / water / vessels / metal / housings)
- **06** Tools & machines
- **07** Consumables
- **08** Services / misc / inactive

### Group handling
- **Vendor folders** under `1. Фирми` (~58): items moved to a type category; `supplier` set from firm name (or `DOSTAW`).
- **System folders** (Електролизьор, Очиска, Газ анализ, …): items go to type categories where possible; `system_tags` preserve product context for future BOMs.
- **Workshop tool folders** (Хале / Производствен / Фрезовъчен / tools inside Металхидрид): same tool name → one article; qty listed per location hint.
- **Numbered prefixes** stripped from category identity (names become clean leaves).
- **Junk / empty** groups (`500`, `951038`, `ЛД`) → inactive/archive.

### Naming cleanup (non-destructive)
- Smart quotes / backtick inches → ASCII `"` / `'`
- Collapsed double spaces, trimmed trailing `-`
- First letter capitalised
- Original name kept as `name_original`

### Merges
- **Auto-merged:** hand tools with the same normalised name only (Decision 1A).  
**Not auto-merged:** other soft duplicates — listed as `merge_candidates` (ITEM_ID/CODE are unreliable in this export).

## How to read the JSON catalog

Each article roughly:

```json
{
  "id": "art-00042",
  "name": "…",
  "category_id": "01.03-thread-fittings",
  "supplier": "Крисметал",
  "system_tags": ["gas-analyzer"],
  "fastener_size": "M8",
  "stock_by_location": [{ "location": "Хале", "qty": 2 }],
  "source_refs": [{ "group": "…", "name": "…", "code": "…" }]
}
```

## Suggested next steps

1. Review `merge_candidates` in the change report (especially Swagelok / gas-analyzer twins).
2. Spot-check `08.02-misc` — leftovers that need a better type rule.
3. Confirm Bulgarian vs English category labels for the UI.
4. When approved: additive schema (`supplier`, `system_tags`, richer locations) + import path update — still no destructive deletes.

## Rebuild

```bash
node templates/warehouse-data/_build_reorg.mjs
```
