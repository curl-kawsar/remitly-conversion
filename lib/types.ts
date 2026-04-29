export type RateSource = "remitly" | "fallback";

export type RateResponse = {
  rate: number;
  fetchedAt: string;
  source: RateSource;
  cached: boolean;
  warning?: string;
};
