"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The Web Speech API isn't in TypeScript's DOM lib; only what we use is declared.
type SpeechResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResultLike> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const ERRORS: Record<string, string> = {
  "not-allowed": "אין הרשאת מיקרופון. אפשרו גישה למיקרופון בהגדרות הדפדפן ונסו שוב.",
  "service-not-allowed": "אין הרשאת מיקרופון. אפשרו גישה למיקרופון בהגדרות הדפדפן ונסו שוב.",
  "no-speech": "לא שמענו כלום. לחצו שוב ודברו קרוב למכשיר.",
  "audio-capture": "לא נמצא מיקרופון במכשיר.",
  network: "זיהוי הדיבור דורש חיבור לאינטרנט.",
};

/**
 * Long-form Hebrew dictation (he-IL): keeps listening until stopped and hands
 * the finished text to `onText` -- verbatim, as the browser heard it.
 */
export function useSpeechDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  // Never leave the microphone open if the screen is closed mid-dictation.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) {
      setError("הדפדפן הזה לא תומך בזיהוי דיבור. נסו Chrome או Safari עדכני, או הקלידו/הדביקו ידנית.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "he-IL";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = "";
    let failed = false;
    recognition.onresult = (event) => {
      let live = "";
      finalText = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += `${result[0].transcript} `;
        else live += result[0].transcript;
      }
      setInterim((finalText + live).trim());
    };
    recognition.onerror = (event) => {
      failed = true;
      if (event.error !== "aborted") setError(ERRORS[event.error] ?? "זיהוי הדיבור נכשל. נסו שוב.");
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
      if (finalText.trim()) onTextRef.current(finalText.trim());
      else if (!failed) setError("לא שמענו כלום. לחצו שוב ודברו קרוב למכשיר.");
    };

    recognitionRef.current = recognition;
    setError(null);
    setInterim("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("לא הצלחנו להפעיל את המיקרופון. נסו שוב.");
    }
  }, []);

  return { listening, interim, error, start, stop };
}
