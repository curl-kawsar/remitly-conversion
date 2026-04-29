import Converter from "@/components/Converter";
import type { RateResponse, RateSource } from "@/lib/types";
import { headers } from "next/headers";

const REVALIDATE_SECONDS = 300;

export const revalidate = REVALIDATE_SECONDS;

type InitialRate = {
  rate: number | null;
  fetchedAt: string | null;
  source: RateSource | null;
  cached: boolean;
  warning: string | null;
  error: string | null;
};

async function getInitialRate(): Promise<InitialRate> {
  const baseUrl = await getBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/api/rate`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    const data = (await response.json()) as unknown;

    if (!response.ok) {
      const message =
        typeof (data as { error?: string }).error === "string"
          ? String((data as { error?: string }).error)
          : "Unable to fetch live rate.";

      return {
        rate: null,
        fetchedAt: null,
        source: null,
        cached: false,
        warning: null,
        error: message,
      };
    }

    if (!isRateResponse(data)) {
      return {
        rate: null,
        fetchedAt: null,
        source: null,
        cached: false,
        warning: null,
        error: "Unexpected response from the rate service.",
      };
    }

    return {
      rate: data.rate,
      fetchedAt: data.fetchedAt,
      source: data.source,
      cached: data.cached,
      warning: data.warning ?? null,
      error: null,
    };
  } catch (error) {
    return {
      rate: null,
      fetchedAt: null,
      source: null,
      cached: false,
      warning: null,
      error: "Unable to fetch live rate. Please try again.",
    };
  }
}

async function getBaseUrl(): Promise<string> {
  const headerList = await headers();
  const forwardedHost = headerList.get("x-forwarded-host");
  const host = forwardedHost ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function isRateResponse(value: unknown): value is RateResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as RateResponse;
  return (
    typeof candidate.rate === "number" &&
    typeof candidate.fetchedAt === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.cached === "boolean"
  );
}

export default async function Home() {
  const initial = await getInitialRate();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#f6f3ee_45%,_#e9e2d3_100%)]">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-14 md:py-16">
        <header className="flex flex-col gap-4">
          <span className="text-xs uppercase tracking-[0.3em] text-muted">
            Remitly live rate
          </span>
          <h1 className="text-4xl font-[var(--font-display)] tracking-tight text-foreground md:text-5xl">
            BDT to USD, refreshed on demand
          </h1>
          <p className="max-w-2xl text-base text-muted">
            Convert Bangladeshi Taka to US Dollars with live Remitly rates.
            Results update instantly and refresh with one tap.
          </p>
        </header>

        <Converter
          initialRate={initial.rate}
          initialFetchedAt={initial.fetchedAt}
          initialSource={initial.source}
          initialCached={initial.cached}
          initialWarning={initial.warning}
          initialError={initial.error}
        />
      </main>
    </div>
  );
}
