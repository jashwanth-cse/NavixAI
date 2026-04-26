import { NextRequest, NextResponse } from "next/server";

type IncidentBriefingRequest = {
  kind?: "incident" | "reroute";
  eventType?: string;
  sourceLabel?: string;
  destinationLabel?: string;
  routeKey?: string;
  severity?: string;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  locationLabel?: string;
  targetLanguage?: string;
};

function getTargetLanguageCode(targetLanguage?: string) {
  const locale = (targetLanguage || "en-US").trim();
  const [languageCode] = locale.split("-");
  return (languageCode || "en").toLowerCase();
}

function buildFallbackNarration({
  kind,
  eventType,
  sourceLabel,
  destinationLabel,
  severity,
  radiusKm,
  locationLabel,
}: IncidentBriefingRequest) {
  const routeText =
    sourceLabel && destinationLabel
      ? ` on the ${sourceLabel} to ${destinationLabel} corridor`
      : "";
  const locationText = locationLabel ? ` near ${locationLabel}` : "";

  if (kind === "reroute") {
    return `Rerouting${routeText}${locationText}. ${severity ?? "High"} risk reported within ${radiusKm ?? 2} kilometers ahead.`;
  }

  switch (eventType) {
    case "door":
      return `Caution. A truck ahead reported an unexpected door-open event${routeText}. Rerouting to a safer alternative.`;
    case "stop":
      return `Traffic advisory. A truck ahead has stopped unexpectedly${routeText}. Switching to a safer route.`;
    case "deviation":
      return `Security advisory. A truck ahead deviated from its planned path${routeText}. Routing around the affected area.`;
    default:
      return `Driver advisory. A shared route incident was reported${routeText}. A safer route is being prepared.`;
  }
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as IncidentBriefingRequest;
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const translateApiKey =
    process.env.GOOGLE_TRANSLATE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY;
  const targetLanguageCode = getTargetLanguageCode(payload.targetLanguage);

  if (!apiKey) {
    return NextResponse.json({ narration: buildFallbackNarration(payload), source: "fallback" });
  }

  const prompt = [
    payload.kind === "reroute"
      ? "Write one short, calm navigation reroute message for a truck driver in English."
      : "Rewrite this fleet incident into one short, calm navigation message for a truck driver in English.",
    "Keep it under 28 words.",
    "Do not mention AI, databases, Firestore, JSON, or internal system details.",
    "Sound like professional in-cab guidance.",
    "Return the final message only in English.",
    `Kind: ${payload.kind ?? "incident"}`,
    `Event type: ${payload.eventType ?? "unknown"}`,
    `Source: ${payload.sourceLabel ?? "unknown"}`,
    `Destination: ${payload.destinationLabel ?? "unknown"}`,
    `Threat route key: ${payload.routeKey ?? "unknown"}`,
    `Threat location label: ${payload.locationLabel ?? "unknown"}`,
    `Threat severity: ${payload.severity ?? "unknown"}`,
    `Threat radius km: ${payload.radiusKm ?? 2}`,
    `Threat latitude: ${payload.lat ?? "unknown"}`,
    `Threat longitude: ${payload.lng ?? "unknown"}`,
  ].join("\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 60,
          },
        }),
      }
    );

    if (!response.ok) {
      return NextResponse.json({ narration: buildFallbackNarration(payload), source: "fallback" });
    }

    const result = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    const englishNarration = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!englishNarration) {
      return NextResponse.json({ narration: buildFallbackNarration(payload), source: "fallback" });
    }

    if (targetLanguageCode === "en" || !translateApiKey) {
      return NextResponse.json({
        narration: englishNarration,
        source: targetLanguageCode === "en" ? "gemini" : "gemini-fallback-language",
      });
    }

    const translationResponse = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${translateApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: englishNarration,
          target: targetLanguageCode,
          format: "text",
          source: "en",
        }),
      }
    );

    if (!translationResponse.ok) {
      return NextResponse.json({ narration: englishNarration, source: "gemini-english" });
    }

    const translationPayload = (await translationResponse.json()) as {
      data?: {
        translations?: Array<{
          translatedText?: string;
        }>;
      };
    };
    const translatedNarration = translationPayload.data?.translations?.[0]?.translatedText?.trim();

    return NextResponse.json({
      narration: translatedNarration || englishNarration,
      source: translatedNarration ? "gemini-google-translate" : "gemini-english",
    });
  } catch {
    return NextResponse.json({ narration: buildFallbackNarration(payload), source: "fallback" });
  }
}
