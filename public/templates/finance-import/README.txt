Hydrogenera finance import/export — finance2.xlsx

Sheet: Data
Columns: Project | Date | Income | Expense | Deadline

- Project  = exact project name
- Date     = real calendar date (Excel date cell)
- Income / Expense = amounts (0 if none)
- Deadline = FAT / SAT / Engineering done / …

Rules
-----
- Date ≤ today → actual (past cash from Excel).
- Date > today → expected from Excel (merged at read time).
- Futures you add in the app are stored separately in localStorage and do
  not overwrite Excel data; export includes both.
- No project finance is stored in the database.

Sample projects:
  Sofia District Heating H2 Blend
  Istanbul Steel Annealing Line
