MoneyWorks / GenSoft warehouse database CSV export

Source:
  SKLAD(2).GDB
  Firebird ODS 11.2 (Firebird 2.5-era database)

Export contents:
  tables/           One UTF-8 CSV per user relation/table.
  blobs/            Binary BLOB payloads referenced from CSV cells as @BLOB_FILE:<path>.
  manifest.csv      Table list, exported row counts, formats and any row errors.
  schema.csv        Field names and Firebird physical data types.
  blob_index.csv    BLOB references and where binary BLOBs were stored.
  export_errors.csv Any row conversion errors.
  blob_errors.csv   Any BLOB conversion errors.

Extraction scope:
  - Current logical records were exported.
  - Deleted records, old MVCC/back-version records, continuation fragments and internal
    Firebird system tables were intentionally not exported as business rows.
  - Text was decoded from the source database as Windows-1251 and written as UTF-8 with BOM.
  - Text BLOBs are included directly in CSV cells.
  - Binary BLOBs are preserved byte-for-byte under blobs/ and referenced from their CSV cells.
  - __SOURCE_PAGE, __SOURCE_LINE and __RECORD_FORMAT are added for traceability; they are not
    MoneyWorks business fields.

Summary:
  User relations represented: 242
  Relations containing current rows: 66
  Current logical rows exported: 68872
  BLOB references exported: 6809
  Unique BLOBs read: 6809
  Binary BLOB files preserved: 2
  Row conversion errors: 0
  BLOB conversion errors: 0

Important:
  This export was produced from the uploaded copy only. The source database file was not modified.
