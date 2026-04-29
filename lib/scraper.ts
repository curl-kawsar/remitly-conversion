import "server-only";
import * as cheerio from "cheerio";

import type { RateResponse, RateSource } from "./types";

const REMITLY_URLS = [
  "https://www.remitly.com/us/en/providers-bangladesh/send-money-to-bkash",
  "https://www.remitly.com/us/en/bangladesh",
];
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const FALLBACK_RATE = 120.0;
const MIN_RATE = 50;
const MAX_RATE = 200;

type CachedRate = {
  rate: number;
  fetchedAt: string;
  source: RateSource;
  cachedAt: number;
  warning?: string;
};

let cachedRate: CachedRate | null = null;

export async function getCachedRate(): Promise<RateResponse> {
  const now = Date.now();
  if (cachedRate && now - cachedRate.cachedAt < CACHE_TTL_MS) {
    return { ...cachedRate, cached: true };
  }

  const fetchedAt = new Date().toISOString();

  try {
    const rate = await scrapeRemitlyRate();
    cachedRate = { rate, fetchedAt, source: "remitly", cachedAt: now };
    return { rate, fetchedAt, source: "remitly", cached: false };
  } catch (error) {
    const warning = "Using fallback rate due to scraping error.";
    cachedRate = {
      rate: FALLBACK_RATE,
      fetchedAt,
      source: "fallback",
      cachedAt: now,
      warning,
    };
    console.warn("[rate] Remitly scrape failed, using fallback.", error);
    return {
      rate: FALLBACK_RATE,
      fetchedAt,
      source: "fallback",
      cached: false,
      warning,
    };
  }
}

async function scrapeRemitlyRate(): Promise<number> {
  let lastError: unknown;

  for (const url of REMITLY_URLS) {
    try {
      const html = await fetchHtml(url);
      const rate = extractRateFromHtml(html);
      if (rate !== null) {
        return rate;
      }

      lastError = new Error(`Rate not found in Remitly HTML for ${url}.`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Rate not found in Remitly HTML.");
}

function extractRateFromHtml(html: string): number | null {
  const contextRate = extractRateFromRemitlyContext(html);
  if (contextRate !== null) {
    return contextRate;
  }

  const $ = cheerio.load(html);
  const candidates = [
    $("#__NEXT_DATA__").html(),
    $("[data-testid*='exchange']").text(),
    $("[data-testid*='rate']").text(),
    $("main").text(),
    $("body").text(),
  ].filter(Boolean) as string[];

  for (const text of candidates) {
    const rate = extractRateFromText(text);
    if (rate !== null) {
      return rate;
    }
  }

  return null;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Remitly responded with ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractRateFromText(text: string): number | null {
  const normalized = text.replace(/\s+/g, " ");

  const patterns: RegExp[] = [
    /(?:1\s*USD|USD\s*1)\s*(?:=|to)?\s*([0-9]+(?:[.,][0-9]+)?)\s*BDT/i,
    /([0-9]+(?:[.,][0-9]+)?)\s*BDT\s*(?:per|for|to)\s*1\s*USD/i,
    /"exchangeRate"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
    /"fxRate"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    const rate = parseRate(match[1]);
    if (isPlausibleRate(rate)) {
      return rate;
    }
  }

  let count = 0;
  for (const match of normalized.matchAll(/([0-9]+(?:[.,][0-9]+)?)\s*BDT/gi)) {
    const rate = parseRate(match[1]);
    if (isPlausibleRate(rate)) {
      return rate;
    }
    count += 1;
    if (count > 10) {
      break;
    }
  }

  return null;
}

function extractRateFromRemitlyContext(html: string): number | null {
  const contextMatch = html.match(
    /__REMITLY_LANDING_PAGE_CONTEXT__\s*=\s*(\{[\s\S]*?\})\s*;/
  );

  if (!contextMatch) {
    return null;
  }

  const contextText = contextMatch[1];
  const directRate = extractRateFromText(contextText);
  if (directRate !== null) {
    return directRate;
  }

  const keyedRate = extractRateFromKeyedValues(contextText);
  if (keyedRate !== null) {
    return keyedRate;
  }

  const parsed = safeJsonParse(contextText);
  if (!parsed) {
    return null;
  }

  const promoSentence =
    getNestedString(parsed, ["promotionMessagingData", "promoRateSentence"]) ??
    getNestedString(parsed, [
      "context",
      "promotionMessagingData",
      "promoRateSentence",
    ]);

  if (promoSentence) {
    const sentenceRate = extractRateFromText(promoSentence);
    if (sentenceRate !== null) {
      return sentenceRate;
    }
  }

  const merchandisingFacts =
    getNestedRecord(parsed, ["merchandisingFacts"]) ??
    getNestedRecord(parsed, ["context", "merchandisingFacts"]);

  if (merchandisingFacts) {
    const factRate = extractRateFromMerchandisingFacts(merchandisingFacts);
    if (factRate !== null) {
      return factRate;
    }
  }

  return null;
}

function extractRateFromKeyedValues(text: string): number | null {
  const patterns = [
    /"effectiveRateAsLowAs"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i,
    /"effectiveRateAsHighAs"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i,
    /"everydayRateAsLowAs"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i,
    /"everydayRateAsHighAs"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const rate = parseRate(match[1]);
    if (isPlausibleRate(rate)) {
      return rate;
    }
  }

  return null;
}

function extractRateFromMerchandisingFacts(
  facts: Record<string, unknown>
): number | null {
  const keys = [
    "effectiveRateAsLowAs",
    "effectiveRateAsHighAs",
    "everydayRateAsLowAs",
    "everydayRateAsHighAs",
  ];

  for (const key of keys) {
    const value = facts[key];
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }

    const rate = parseRate(String(value));
    if (isPlausibleRate(rate)) {
      return rate;
    }
  }

  return null;
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getNestedString(value: unknown, path: string[]): string | null {
  const result = getNestedValue(value, path);
  return typeof result === "string" ? result : null;
}

function getNestedRecord(
  value: unknown,
  path: string[]
): Record<string, unknown> | null {
  const result = getNestedValue(value, path);
  if (!result || typeof result !== "object") {
    return null;
  }

  return result as Record<string, unknown>;
}

function getNestedValue(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, value);
}

function parseRate(value: string): number {
  return Number(value.replace(/,/g, ""));
}

function isPlausibleRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MIN_RATE && rate <= MAX_RATE;
}
