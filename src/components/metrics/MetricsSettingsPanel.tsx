"use client";

import type { CompanyMetricsSettings } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-teal-accent";
const labelCls =
  "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted";

interface MetricsSettingsPanelProps {
  settings: CompanyMetricsSettings;
  onChange: (patch: Partial<CompanyMetricsSettings>) => void;
}

export default function MetricsSettingsPanel({
  settings,
  onChange,
}: MetricsSettingsPanelProps) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
            Metrics conditions
          </h2>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wide text-deep">
            Stale after (days inactive)
          </legend>
          <label className="block">
            <span className={labelCls}>Cold Lead</span>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={settings.staleColdDays}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0)
                  onChange({ staleColdDays: Math.round(n) });
              }}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Hot Lead</span>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={settings.staleHotDays}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0)
                  onChange({ staleHotDays: Math.round(n) });
              }}
            />
          </label>
          <p className="text-[11px] text-muted">
            Under Development projects are never marked stale.
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wide text-deep">
            Maturity windows (months)
          </legend>
          <label className="block">
            <span className={labelCls}>Cold → Under Development</span>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={settings.maturityUnderDevelopmentMonths}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0)
                  onChange({
                    maturityUnderDevelopmentMonths: Math.round(n),
                  });
              }}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Cold → Commissioned</span>
            <input
              type="number"
              min={1}
              className={inputCls}
              value={settings.maturityCommissionedMonths}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0)
                  onChange({ maturityCommissionedMonths: Math.round(n) });
              }}
            />
          </label>
          <p className="text-[11px] text-muted">
            Leads younger than this window are excluded from conversion rates.
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wide text-deep">
            Expected conversion (0–100%)
          </legend>
          <label className="block">
            <span className={labelCls}>Healthy active → convert</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className={inputCls}
              value={Math.round(settings.healthyConversionProbability * 100)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                onChange({
                  healthyConversionProbability: Math.min(
                    1,
                    Math.max(0, n / 100),
                  ),
                });
              }}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Stale → recover & convert</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className={inputCls}
              value={Math.round(settings.staleRecoveryProbability * 100)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                onChange({
                  staleRecoveryProbability: Math.min(1, Math.max(0, n / 100)),
                });
              }}
            />
          </label>
          <p className="text-[11px] text-muted">
            Management estimates for the Conversion Range “expected” scenario.
          </p>
        </fieldset>
      </div>
    </div>
  );
}
