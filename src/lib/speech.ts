// Speech to text through the browser (Chrome on Android sends it to Google's
// recognizer). German, with the words shown while they are spoken.
import { useCallback, useEffect, useRef, useState } from "react";

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => ctor() !== null;

const ERRORS: Record<string, string> = {
  "not-allowed": "Die App darf das Mikrofon nicht benutzen. Erlaub es in den Einstellungen von Chrome, oder tipp deinen Wunsch.",
  "service-not-allowed": "Die App darf das Mikrofon nicht benutzen. Erlaub es in den Einstellungen von Chrome, oder tipp deinen Wunsch.",
  "no-speech": "Ich habe nichts gehört. Tipp auf Sprechen und versuch es nochmal.",
  "audio-capture": "Kein Mikrofon gefunden. Tipp deinen Wunsch lieber.",
  network: "Die Spracherkennung braucht Netz. Prüf die Verbindung, oder tipp deinen Wunsch.",
};

/**
 * listen() starts, stop() ends; `text` grows while Adrian speaks, `done` fires
 * once with the final words when the recognizer stops.
 */
export function useSpeech(done: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const latest = useRef("");
  const onDone = useRef(done);
  onDone.current = done;

  useEffect(() => () => rec.current?.abort(), []);

  const listen = useCallback(() => {
    const C = ctor();
    if (!C) return;
    rec.current?.abort();
    const r = new C();
    r.lang = "de-DE";
    r.interimResults = true;
    r.continuous = false;
    latest.current = "";
    let failed = false;
    r.onresult = (e) => {
      const words = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join("");
      latest.current = words;
      setText(words);
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      failed = true;
      setError(ERRORS[e.error] ?? "Die Spracherkennung hat nicht geklappt. Versuch es nochmal oder tipp deinen Wunsch.");
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      const said = latest.current.trim();
      if (!failed && said) onDone.current(said);
    };
    rec.current = r;
    setText("");
    setError(null);
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);
  const cancel = useCallback(() => {
    latest.current = "";
    rec.current?.abort();
    setListening(false);
  }, []);

  return { listening, text, error, listen, stop, cancel };
}
