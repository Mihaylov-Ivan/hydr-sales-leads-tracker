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
  amounts). Latest full data export with history columns:
  financial-data-2026-08-06 (6)_updated.csv
  Minimal history example: financial-data-history-columns_updated.csv
  History is merged by event_id on import; amounts never go to Postgres.
- Header “Download history” exports type=history rows only.
- Older CSVs without history columns still import; missing columns are
  treated as empty. Re-export (or use *_updated.csv) to get the full header.

Sample projects:
  Sofia District Heating H2 Blend
  Istanbul Steel Annealing Line
