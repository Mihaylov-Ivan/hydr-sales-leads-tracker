Hydrogenera finance import/export — finance2.xlsx

Sheet: Data
Columns: Project | Date | Income | Expense | Deadline | Category

- Project  = exact project name
- Date     = real calendar date (Excel date cell)
- Income / Expense = amounts (0 if none)
- Deadline = FAT / SAT / Engineering done / … (or free-text label)
- Category = expense type only (leave blank on income rows):
    man-hr | materials | installation
  If Category is blank on an expense row, it is inferred from Deadline/label.

Sheet: Company
Columns: Month | Salary | Other | Status

- Month  = yyyy-mm (or any date in that month)
- Salary = monthly payroll (€)
- Other  = unexpected company spend that month (€)
- Status = actual | projected

Rules
-----
- Date ≤ today → actual (past cash from Excel).
- Date > today → expected from Excel (merged at read time).
- Futures you add in the app are stored separately in localStorage and do
  not overwrite Excel data; export includes both.
- Company salary/other from the Company sheet replace company monthly
  values on import.
- Old files without Category / Company still import; category is inferred
  and company opex is cleared until you enter or re-export it.
- No project finance is stored in the database.
- Portable financial CSV also supports type=history rows (before/after
  amounts), type=warehouse_lot (unit costs linked by lot id), and
  type=warehouse_sklad_map (MoneyWorks System-* SKLAD → project site/slot).
  Latest: financial-data-2026-08-06 (9)_updated_updated_updated.csv
  Minimal history example: financial-data-history-columns_updated.csv
  History is merged by event_id on import; amounts never go to Postgres.
  Missing Italy/Warsaw/Workshop projects: use Warehouse → Map System→Projects
  (creates seeds + remaps); then re-export CSV to persist their map rows.
  System - Украйна maps to 5MW BoP/BoS Ushgorod with N1.
- Expense rows may include warehouse_lot_id (link to warehouse lot) and
  budget_amount (original predicted envelope when amount was later aligned
  to WH spent). Older CSVs without those columns still import.
- New optional columns: source_sklad, wh_site, wh_slot (warehouse location /
  MoneyWorks provenance). Older CSVs without them still import.
- Header “Download history” exports type=history rows only.
- Older CSVs without history columns still import; missing columns are
  treated as empty. Re-export (or use *_updated.csv) to get the full header.
- Financials always persist in browser localStorage (and CSV). Warehouse
  catalog / stock / movements sync to Supabase (migration-023+).
  SKLAD→project maps: migration-025.

Sample projects:
  Sofia District Heating H2 Blend
  Istanbul Steel Annealing Line
