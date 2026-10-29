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
