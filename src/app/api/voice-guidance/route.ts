import { NextRequest, NextResponse } from "next/server";

type VoiceGuidanceRequest = {
  text?: string;
  targetLanguage?: string;
};

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getTargetLanguageCode(targetLanguage?: string) {
  const locale = (targetLanguage || "en-US").trim();
  const [languageCode] = locale.split("-");
  return (languageCode || "en").toLowerCase();
}

async function translateText({
  text,
  targetLanguageCode,
  apiKey,
}: {
  text: string;
  targetLanguageCode: string;
  apiKey: string;
}) {
  if (targetLanguageCode === "en") {
    return text;
  }

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text,
        target: targetLanguageCode,
        format: "text",
        source: "en",
        model: "nmt",
      }),
    }
  );

  if (!response.ok) {
    return text;
  }

  const payload = (await response.json()) as {
    data?: {
      translations?: Array<{
        translatedText?: string;
      }>;
    };
  };
  const translatedText = payload.data?.translations?.[0]?.translatedText?.trim();

  return translatedText ? decodeHtmlEntities(translatedText) : text;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as VoiceGuidanceRequest;
  const text = payload.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const targetLanguageCode = getTargetLanguageCode(payload.targetLanguage);
  const translateApiKey =
    process.env.GOOGLE_TRANSLATE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY;
  const ttsApiKey =
    process.env.GOOGLE_TTS_API_KEY ||
    process.env.GOOGLE_TEXT_TO_SPEECH_API_KEY ||
    translateApiKey;

  if (!ttsApiKey) {
    return NextResponse.json({ text, translatedText: text, source: "tts-key-missing" }, { status: 503 });
  }

  const translatedText = translateApiKey
    ? await translateText({ text, targetLanguageCode, apiKey: translateApiKey })
    : text;

  const ttsResponse = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text: translatedText },
        voice: {
          languageCode: targetLanguageCode,
          ssmlGender: "NEUTRAL",
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1,
          pitch: 0,
        },
      }),
    }
  );

  if (!ttsResponse.ok) {
    return NextResponse.json(
      { error: `Google TTS failed with ${ttsResponse.status}`, translatedText },
      { status: ttsResponse.status }
    );
  }

  const ttsPayload = (await ttsResponse.json()) as { audioContent?: string };

  if (!ttsPayload.audioContent) {
    return NextResponse.json({ error: "Google TTS returned no audio.", translatedText }, { status: 502 });
  }

  return NextResponse.json({
    translatedText,
    audioContent: ttsPayload.audioContent,
    mimeType: "audio/mpeg",
    source: targetLanguageCode === "en" ? "google-tts" : "google-translate-tts",
  });
}
