# Remitly Rate Converter

Production-ready currency converter for BDT to USD using live Remitly rates.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 to view the app.

## Architecture

- app/page.tsx: server-rendered landing page with initial rate fetch.
- app/api/rate/route.ts: server-only scraping endpoint with caching and rate limiting.
- lib/scraper.ts: Remitly scraping, timeout handling, and fallback rate.
- components/Converter.tsx: client-side converter, refresh, and UI states.

## Notes

- The API route caches exchange rates for five minutes to avoid excessive scraping.
- If scraping fails, the API returns a fallback rate with a warning message.
- Set NEXT_PUBLIC_SITE_URL in production if the server needs a fixed base URL.
