MoneyWorks warehouse import
===========================

Core CSVs live in MoneyWorks_Core_Warehouse_CSV/tables/.

App import (Warehouse page → Import MoneyWorks):
  - qty > 0 only
  - Sites: ELX / MH / Van × slots Project / Spare / Buffer
  - Mapping defaults:
      ОСНОВЕН, legacy Склад     → ELX / Spare
      Production halls / Цех    → ELX / Buffer
      МЕТАЛХИДРИД               → MH / Spare
      Ford Transit              → Van / Spare
      System - *                → ELX / Buffer (parked; source_sklad kept)
      Inactive / empty          → skipped
  - No project expense rows created (link later via CSV / Supabase)
  - Run supabase/migration-024-warehouse-sites-slots.sql before persisting to remote
