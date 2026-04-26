import { NextRequest, NextResponse } from "next/server";

type IncidentBriefingRequest = {
  eventType?: string;
  sourceLabel?: string;
  destinationLabel?: string;
};

function buildFallbackNarration({
  eventType,
  sourceLabel,
  destinationLabel,
}: IncidentBriefingRequest) {
  const routeText =
    sourceLabel && destinationLabel
      ? ` on the ${sourceLabel} to ${destinationLabel} corridor`
      : "";

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

  if (!apiKey) {
    return NextResponse.json({ narration: buildFallbackNarration(payload), source: "fallback" });
  }

  const prompt = [
    "Rewrite this fleet incident into one short, calm navigation message for a truck driver.",
    "Keep it under 24 words.",
    "Do not mention AI, databases, Firestore, JSON, or internal system details.",
    "Sound like professional in-cab guidance.",
    `Event type: ${payload.eventType ?? "unknown"}`,
    `Source: ${payload.sourceLabel ?? "unknown"}`,
    `Destination: ${payload.destinationLabel ?? "unknown"}`,
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
    const narration = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    return NextResponse.json({
      narration: narration || buildFallbackNarration(payload),
      source: narration ? "gemini" : "fallback",
    });
  } catch {
    return NextResponse.json({ narration: buildFallbackNarration(payload), source: "fallback" });
  }
}
