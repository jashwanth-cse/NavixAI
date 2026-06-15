import { NextRequest, NextResponse } from "next/server";

type FuelPriceCacheEntry = {
  city: string;
  dieselPrice: number;
  source: string;
  fetchedAt: number;
};

const cacheTtlMs = 6 * 60 * 60 * 1000;
const fuelPriceCache = new Map<string, FuelPriceCacheEntry>();

function normalizeCity(city: string) {
  return city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findDieselPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const price = findDieselPrice(item);
      if (price !== null) {
        return price;
      }
    }
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (key.toLowerCase().includes("diesel")) {
      const price = findDieselPrice(entry);
      if (price !== null) {
        return price;
      }
    }
  }

  for (const entry of Object.values(record)) {
    const price = findDieselPrice(entry);
    if (price !== null) {
      return price;
    }
  }

  return null;
}

function findCityDieselPrice(value: unknown, city: string): number | null {
  const normalizedCity = normalizeCity(city);

  if (Array.isArray(value)) {
    const cityRecords = value.filter((entry): entry is Record<string, unknown> => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return false;
      }

      return typeof (entry as Record<string, unknown>).city === "string";
    });
    const exactMatch = cityRecords.find((entry) => normalizeCity(String(entry.city)) === normalizedCity);
    const fuzzyMatch =
      exactMatch ??
      cityRecords.find((entry) => {
        const entryCity = normalizeCity(String(entry.city));
        return entryCity.includes(normalizedCity) || normalizedCity.includes(entryCity);
      });

    if (fuzzyMatch) {
      return findDieselPrice(fuzzyMatch.price ?? fuzzyMatch.diesel ?? fuzzyMatch.dieselPrice);
    }

    if (cityRecords.length) {
      return null;
    }
  }

  return findDieselPrice(value);
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim();

  if (!city) {
    return NextResponse.json({ error: "city is required" }, { status: 400 });
  }

  const cacheKey = normalizeCity(city);
  const cached = fuelPriceCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < cacheTtlMs) {
    return NextResponse.json({
      city: cached.city,
      dieselPrice: cached.dieselPrice,
      source: cached.source,
      cached: true,
    });
  }

  const apiKey =
    process.env.INDIAN_API_KEY ||
    process.env.INDIANAPI_KEY ||
    process.env.INDIAN_API_FUEL_PRICE_KEY ||
    "";
  const endpoint =
    process.env.INDIAN_API_FUEL_PRICE_URL ||
    "https://fuel.indianapi.in/live_fuel_price";
  const url = new URL(endpoint);
  url.searchParams.set("city", city);
  url.searchParams.set("fuel_type", "diesel");
  url.searchParams.set("location_type", "city");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(apiKey
        ? {
            Authorization: `Bearer ${apiKey}`,
            "X-Api-Key": apiKey,
          }
        : {}),
    },
    next: { revalidate: 21600 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Fuel price API failed with ${response.status}` },
      { status: response.status }
    );
  }

  const payload = (await response.json()) as unknown;
  const dieselPrice = findCityDieselPrice(payload, city);

  if (dieselPrice === null) {
    return NextResponse.json(
      { error: "Diesel price was not found in the fuel price response." },
      { status: 502 }
    );
  }

  const entry = {
    city,
    dieselPrice,
    source: "fuel.indianapi.in",
    fetchedAt: now,
  };
  fuelPriceCache.set(cacheKey, entry);

  return NextResponse.json({
    city: entry.city,
    dieselPrice: entry.dieselPrice,
    source: entry.source,
    cached: false,
  });
}
