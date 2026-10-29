// Cross-tab jumps: a screen asks the shell to show something on another tab.
const OPEN_EVENT = "comics:open-event";

export function openEvent(eventId: number) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: eventId }));
}

export function onOpenEvent(handler: (eventId: number) => void): () => void {
  const on = (e: Event) => handler((e as CustomEvent<number>).detail);
  window.addEventListener(OPEN_EVENT, on);
  return () => window.removeEventListener(OPEN_EVENT, on);
}

const OPEN_RUN = "comics:open-run";

/** Shows every issue of a series (Alle Hefte), with this issue marked. */
export function openRun(seriesId: number, issueId?: number) {
  window.dispatchEvent(new CustomEvent(OPEN_RUN, { detail: { seriesId, issueId } }));
}

export function onOpenRun(handler: (seriesId: number, issueId?: number) => void): () => void {
  const on = (e: Event) => {
    const d = (e as CustomEvent<{ seriesId: number; issueId?: number }>).detail;
    handler(d.seriesId, d.issueId);
  };
  window.addEventListener(OPEN_RUN, on);
  return () => window.removeEventListener(OPEN_RUN, on);
}
