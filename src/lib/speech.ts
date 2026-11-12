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

/** Longest a wish may run; then it is sent as if "Fertig" was tapped. */
const MAX_MS = 60_000;

/**
 * listen() starts, stop() ("Fertig") ends; `text` grows while Adrian speaks,
 * `done` fires once with all the words. Pauses do not end it: when the
 * recognizer stops on its own after a silence, it is started again and the
 * new words are added to the old ones.
 */
export function useSpeech(done: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  /** Words of earlier rounds (before the recognizer restarted), and of the current one. */
  const kept = useRef("");
  const current = useRef("");
  /** Set by "Fertig": the next end sends the words instead of listening on. */
  const finishing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const onDone = useRef(done);
  onDone.current = done;

  const all = () => [kept.current, current.current].map((x) => x.trim()).filter(Boolean).join(" ");

  useEffect(() => () => {
    finishing.current = false;
    window.clearTimeout(timer.current);
    const r = rec.current;
    rec.current = null;
    r?.abort();
  }, []);

  const round = useCallback(() => {
    const C = ctor();
    if (!C) return;
    const r = new C();
    r.lang = "de-DE";
    r.interimResults = true;
    r.continuous = true;
    current.current = "";
    let failed = false;
    r.onresult = (e) => {
      current.current = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join("");
      setText(all());
    };
    r.onerror = (e) => {
      // Silence or an abort is not a failure; the round simply ends.
      if (e.error === "aborted" || e.error === "no-speech") return;
      failed = true;
      setError(ERRORS[e.error] ?? "Die Spracherkennung hat nicht geklappt. Versuch es nochmal oder tipp deinen Wunsch.");
    };
    r.onend = () => {
      if (rec.current !== r) return;
      kept.current = all();
      current.current = "";
      if (!failed && !finishing.current) {
        // Stopped by itself after a pause: listen on.
        round();
        return;
      }
      rec.current = null;
      window.clearTimeout(timer.current);
      setListening(false);
      const said = kept.current;
      if (!failed && said) onDone.current(said);
    };
    rec.current = r;
    r.start();
  }, []);

  const listen = useCallback(() => {
    if (!ctor()) return;
    const old = rec.current;
    rec.current = null;
    old?.abort();
    kept.current = "";
    current.current = "";
    finishing.current = false;
    setText("");
    setError(null);
    setListening(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { finishing.current = true; rec.current?.stop(); }, MAX_MS);
    round();
  }, [round]);

  const stop = useCallback(() => {
    finishing.current = true;
    rec.current?.stop();
  }, []);
  const cancel = useCallback(() => {
    finishing.current = false;
    window.clearTimeout(timer.current);
    const r = rec.current;
    rec.current = null;
    r?.abort();
    setListening(false);
  }, []);

  return { listening, text, error, listen, stop, cancel };
}
