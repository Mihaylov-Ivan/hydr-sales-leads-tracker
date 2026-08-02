"use client";

import { useState, type ReactNode } from "react";
import type { ConfidenceLabel, EstimateSource } from "@/lib/metrics/types";
import MetricInfoTip from "./MetricInfoTip";

interface MetricCardProps {
  title: string;
  primary: string;
  secondary?: string;
  detail?: string;
  footer?: string;
  estimateSource?: EstimateSource;
  confidence?: ConfidenceLabel;
  statusText?: string;
  /** Plain-language explanation shown via the “i” control */
  info?: string;
  onClick?: () => void;
  children?: ReactNode;
  accent?: "default" | "warn" | "good" | "muted";
}

const accentBorder: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  default: "border-line",
  warn: "border-amber-accent/50",
  good: "border-green-accent/40",
  muted: "border-line",
};

export default function MetricCard({
  title,
  primary,
  secondary,
  detail,
  footer,
  estimateSource,
  confidence,
  statusText,
  info,
  onClick,
  children,
  accent = "default",
}: MetricCardProps) {
  const interactive = Boolean(onClick);
  const [tipOpen, setTipOpen] = useState(false);

  return (
    <div
      className={`relative flex h-full flex-col rounded-xl border bg-panel p-4 text-left shadow-sm transition ${accentBorder[accent]} ${
        interactive
          ? "hover:border-teal-accent/50 hover:shadow-md"
          : ""
      } ${tipOpen ? "z-30" : "z-0"}`}
    >
      {/* Stretch hit target — sits under the header so the info “i” stays a real button */}
      {interactive && (
        <button
          type="button"
          aria-label={`View projects for ${title}`}
          onClick={onClick}
          className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-accent/40"
        />
      )}

      <div className="relative z-20 mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
            {title}
          </h3>
          {info && (
            <MetricInfoTip
              title={title}
              text={info}
              onOpenChange={setTipOpen}
            />
          )}
        </div>
        {estimateSource && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              estimateSource === "historical"
                ? "bg-teal-soft text-teal-accent"
                : "bg-surface-tint text-muted"
            }`}
          >
            {estimateSource === "historical"
              ? "Historical"
              : "Management estimate"}
          </span>
        )}
      </div>

      <div
        className={`relative z-10 flex flex-1 flex-col ${
          interactive ? "pointer-events-none" : ""
        }`}
      >
        <p className="text-3xl font-semibold tracking-tight text-deep">
          {primary}
        </p>

        {statusText && (
          <p className="mt-1 text-sm font-semibold text-ink">{statusText}</p>
        )}
        {secondary && (
          <p className="mt-1 text-sm text-ink">{secondary}</p>
        )}
        {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
        {children}
        {(footer || confidence) && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            {footer && <p className="text-[11px] text-muted">{footer}</p>}
            {confidence && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  confidence === "Low confidence"
                    ? "bg-amber-accent/15 text-amber-accent"
                    : confidence === "Developing estimate"
                      ? "bg-surface-tint text-muted"
                      : "bg-teal-soft text-teal-accent"
                }`}
              >
                {confidence}
              </span>
            )}
          </div>
        )}
        {interactive && (
          <p className="mt-2 text-[11px] font-medium text-teal-accent">
            View projects →
          </p>
        )}
      </div>
    </div>
  );
}
