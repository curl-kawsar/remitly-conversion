"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { RateSource } from "@/lib/types";

type ConverterProps = {
  initialRate: number | null;
  initialFetchedAt: string | null;
  initialSource: RateSource | null;
  initialCached: boolean;
  initialWarning: string | null;
  initialError: string | null;
};

type ConversionDirection = "BDT_TO_USD" | "USD_TO_BDT";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const usdRateFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6,
});

const bdtFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Converter({
  initialRate,
  initialFetchedAt,
  initialSource,
  initialCached,
  initialWarning,
  initialError,
}: ConverterProps) {
  const [amount, setAmount] = useState("10000");
  const [direction, setDirection] =
    useState<ConversionDirection>("BDT_TO_USD");
  const [rate, setRate] = useState<number | null>(initialRate);
  const [source, setSource] = useState<RateSource | null>(initialSource);
  const [cached, setCached] = useState(initialCached);
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialFetchedAt);
  const [warning, setWarning] = useState<string | null>(initialWarning);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(false);

  const parsedAmount = Number(amount);
  const hasValidAmount =
    amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const showInputError = amount.trim() !== "" && !hasValidAmount;

  const isBdtToUsd = direction === "BDT_TO_USD";
  const fromCurrency = isBdtToUsd ? "BDT" : "USD";
  const toCurrency = isBdtToUsd ? "USD" : "BDT";
  const directionLabel = isBdtToUsd ? "BDT to USD" : "USD to BDT";
  const headline = isBdtToUsd
    ? "Convert Bangladeshi Taka instantly"
    : "Convert US Dollars instantly";

  const convertedAmount = useMemo(() => {
    if (rate === null || rate <= 0 || !hasValidAmount) {
      return null;
    }

    return isBdtToUsd ? parsedAmount / rate : parsedAmount * rate;
  }, [parsedAmount, hasValidAmount, rate, isBdtToUsd]);

  const refreshRate = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/rate", { cache: "no-store" });
      const data = (await response.json()) as {
        rate?: number;
        fetchedAt?: string;
        source?: RateSource;
        cached?: boolean;
        warning?: string;
        error?: string;
      };

      if (
        !response.ok ||
        typeof data.rate !== "number" ||
        !data.fetchedAt ||
        !data.source
      ) {
        throw new Error(data.error ?? "Unable to refresh the exchange rate.");
      }

      setRate(data.rate);
      setSource(data.source);
      setCached(Boolean(data.cached));
      setLastUpdated(data.fetchedAt);
      setWarning(data.warning ?? null);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to refresh the exchange rate.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rate === null) {
      void refreshRate();
    }
  }, [rate, refreshRate]);

  useEffect(() => {
    if (rate === null) {
      return;
    }

    setFlash(true);
    const timeout = setTimeout(() => setFlash(false), 350);
    return () => clearTimeout(timeout);
  }, [rate]);

  const usdToBdtLabel =
    rate === null ? "Not available" : `${bdtFormatter.format(rate)} BDT`;
  const bdtToUsdLabel =
    rate === null ? "Not available" : usdRateFormatter.format(1 / rate);
  const sourceLabel =
    source === "remitly"
      ? "Remitly"
      : source === "fallback"
        ? "Fallback"
        : "Pending";

  const outputValue =
    convertedAmount === null
      ? "--"
      : isBdtToUsd
        ? usdFormatter.format(convertedAmount)
        : `${bdtFormatter.format(convertedAmount)} BDT`;

  return (
    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-3xl border border-foreground/10 bg-white/90 p-6 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.45)] backdrop-blur md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">
              {directionLabel}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              {headline}
            </h2>
          </div>
          <button
            type="button"
            onClick={refreshRate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                loading ? "animate-pulse bg-foreground/40" : "bg-accent"
              }`}
            />
            {loading ? "Refreshing..." : "Refresh rate"}
          </button>
        </div>

        <div className="mt-6 inline-flex rounded-full border border-foreground/10 bg-white p-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          <button
            type="button"
            onClick={() => setDirection("BDT_TO_USD")}
            className={`rounded-full px-4 py-2 transition ${
              isBdtToUsd
                ? "bg-foreground text-background"
                : "text-foreground/70"
            }`}
            aria-pressed={isBdtToUsd}
          >
            BDT → USD
          </button>
          <button
            type="button"
            onClick={() => setDirection("USD_TO_BDT")}
            className={`rounded-full px-4 py-2 transition ${
              !isBdtToUsd
                ? "bg-foreground text-background"
                : "text-foreground/70"
            }`}
            aria-pressed={!isBdtToUsd}
          >
            USD → BDT
          </button>
        </div>

        <div className="mt-8">
          <label
            htmlFor="amount"
            className="text-sm font-medium text-foreground"
          >
            Amount in {fromCurrency}
          </label>
          <div className="relative mt-3">
            <input
              id="amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-2xl border border-foreground/15 bg-white px-4 py-3 text-lg text-foreground shadow-sm outline-none ring-0 transition focus:border-foreground/40"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
              {fromCurrency}
            </span>
          </div>
          {showInputError ? (
            <p className="mt-2 text-xs font-medium text-red-600">
              Enter a positive number to convert.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Uses the latest Remitly exchange rate with a short cache window.
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-foreground/40" />
            <span>Last updated: {formatTimestamp(lastUpdated)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-foreground/10 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
              {sourceLabel}
            </span>
            {cached && (
              <span className="rounded-full border border-foreground/10 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-foreground">
                Cached
              </span>
            )}
          </div>
        </div>

        {warning && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {warning}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-foreground/10 bg-[linear-gradient(135deg,#ffffff_0%,#f3f4f6_100%)] p-6 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.45)] md:p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-muted">
          Converted total ({toCurrency})
        </p>
        <div
          className={`mt-4 text-4xl font-semibold text-foreground md:text-5xl ${
            flash ? "animate-[value-pop_0.35s_ease-out]" : ""
          }`}
          aria-live="polite"
        >
          {outputValue}
        </div>
        <div className="mt-3 text-sm text-muted">
          <div>1 USD = {usdToBdtLabel}</div>
          <div>1 BDT = {bdtToUsdLabel}</div>
        </div>

        {!rate && loading && (
          <p className="mt-4 text-sm font-medium text-foreground">
            Fetching the latest rate...
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 text-xs text-muted">
          Conversions update instantly as you type. Refresh to pull a new rate.
        </div>
      </div>
    </section>
  );
}
