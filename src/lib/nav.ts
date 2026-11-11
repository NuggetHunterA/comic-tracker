// Cross-tab jumps: a screen opens something on another tab. Each jump is a
// history entry, so the back button returns to where it started.
import { navigate } from "./route";

/** Opens an event on the Serien tab. */
export function openEvent(eventId: number) {
  navigate({ tab: "serien", sub: "events", sel: { kind: "event", id: eventId } });
}

/** Shows every issue of a series (Alle Hefte), with this issue marked. */
export function openRun(seriesId: number, issueId?: number) {
  navigate({ tab: "serien", sub: "serien", sel: issueId === undefined ? { kind: "all", id: seriesId } : { kind: "all", id: seriesId, sel: issueId } });
}
