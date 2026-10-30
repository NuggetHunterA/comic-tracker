import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { StoreProvider, useStore } from "./lib/store";
import { monthLabel, monthStart } from "./lib/dates";
import { Nav, TABS, type Tab } from "./components/Nav";
import { BackButton, Detail, EmptyDetail } from "./components/Detail";
import { AllIssues } from "./components/AllIssues";
import { seriesLong } from "./lib/labels";
import { IssueDetail } from "./components/IssueDetail";
import { InfiniteDrop } from "./components/InfiniteDrop";
import { ImportForm } from "./components/ImportForm";
import { Login } from "./screens/Login";
import { PlanScreen } from "./screens/PlanScreen";
import { StapelList, StapelSeries, type StapelSel } from "./screens/StapelScreen";
import { KatalogList } from "./screens/KatalogScreen";
import { SerienList, SeriesDetail, type SerienSel, type SerienTab } from "./screens/SerienScreen";
import { EventDetail } from "./components/EventDetail";
import { SeriesOrder } from "./components/SeriesOrder";
import { onOpenEvent, onOpenRun } from "./lib/nav";

const WIDE = "(min-width: 700px)";

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

function useTab(): Tab {
  const read = () => {
    const h = window.location.hash.slice(1);
    return (TABS.find((t) => t.id === h)?.id ?? "plan") as Tab;
  };
  const [tab, setTab] = useState<Tab>(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return tab;
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) return setSession(data.session);
      // Single-user app: sign in with the app account if the build has one, else show the form.
      const { VITE_APP_EMAIL: email, VITE_APP_PASSWORD: password } = import.meta.env;
      if (email && password) {
        const { data: signed } = await supabase.auth.signInWithPassword({ email, password });
        if (signed.session) return setSession(signed.session);
      }
      setSession(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return null;
  if (!session) return <Login />;
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const wide = useWide();
  const tab = useTab();
  const { data, error, plan, today, items } = useStore();

  const [planSel, setPlanSel] = useState<number | null>(null);
  const [stapelSel, setStapelSel] = useState<StapelSel>(null);
  const [month, setMonth] = useState(() => monthStart(today));
  const [katalogSel, setKatalogSel] = useState<number | null>(null);
  const [serienTab, setSerienTab] = useState<SerienTab>("serien");
  const [serienSel, setSerienSel] = useState<SerienSel>(null);

  const tonight = plan.find((e) => e.date === today)?.entries ?? [];
  const pile = items.filter((i) => (i.ui.status === "pile" || i.ui.status === "expected") && i.readable).length;
  const counters: Record<Tab, string> = {
    plan: `${tonight.length} HEUTE`,
    stapel: String(pile),
    katalog: monthLabel(month),
    serien: String(data?.followed.length ?? 0),
  };

  // Unfolded, the detail pane shows something useful right away.
  const planShown = planSel ?? (wide ? tonight[0]?.issueId ?? null : null);
  const closePlan = useCallback(() => setPlanSel(null), []);
  const closeStapel = useCallback(() => setStapelSel(null), []);
  const closeKatalog = useCallback(() => setKatalogSel(null), []);
  const closeSerien = useCallback(() => setSerienSel(null), []);
  // The detail's event line jumps here from any tab.
  useEffect(() => onOpenEvent((id) => {
    setSerienTab("events");
    setSerienSel({ kind: "event", id });
    window.location.hash = "serien";
  }), []);
  // So does the detail's series line, to the whole run of the series.
  useEffect(() => onOpenRun((id, sel) => {
    setSerienTab("serien");
    setSerienSel({ kind: "all", id, sel });
    window.location.hash = "serien";
  }), []);

  let list: React.ReactNode = null;
  let detail: React.ReactNode = null;
  let wideList = false;

  if (tab === "plan") {
    list = <PlanScreen selected={planShown} onSelect={setPlanSel} />;
    detail = planShown ? (
      <Detail wide={wide} label="Heft im Detail" onClose={closePlan}><IssueDetail issueId={planShown} onClose={closePlan} /></Detail>
    ) : wide ? <Detail wide label="Heft im Detail" onClose={closePlan}><EmptyDetail text="Tipp ein Heft an, um es zu bewerten, zu verschieben oder aus dem Plan zu nehmen." /></Detail> : null;
  } else if (tab === "stapel") {
    list = <StapelList wide={wide} sel={stapelSel} onSelect={setStapelSel} />;
    const s = stapelSel;
    const body =
      s?.kind === "import" ? <ImportForm onDone={closeStapel} /> :
      s?.kind === "order" ? <SeriesOrder /> :
      s?.kind === "series" ? <StapelSeries seriesId={s.id} onSelect={setStapelSel} /> :
      s?.kind === "all" ? (
        <AllIssues key={s.id} seriesId={s.id} sel={s.sel}
          head={wide ? <BackButton onClick={() => setStapelSel({ kind: "series", id: s.id })}>{seriesLong(data?.series.get(s.id))}</BackButton> : undefined}
          onSelect={(id) => setStapelSel({ kind: "issue", id, series: s.id, fromAll: true })} />
      ) :
      s?.kind === "issue" ? (
        <>
          {s.fromAll && s.series ? (
            <BackButton onClick={() => setStapelSel({ kind: "all", id: s.series!, sel: s.id })}>Alle Hefte</BackButton>
          ) : wide && s.series ? (
            <BackButton onClick={() => setStapelSel({ kind: "series", id: s.series! })}>Zur Serie</BackButton>
          ) : null}
          <IssueDetail issueId={s.id} onClose={closeStapel} />
        </>
      ) : wide ? <EmptyDetail text="Wähl links eine Serie, um ihre Hefte zu sehen." /> : null;
    detail = body ? <Detail wide={wide} label="Stapel im Detail" onClose={closeStapel}>{body}</Detail> : null;
  } else if (tab === "katalog") {
    wideList = true;
    list = <KatalogList month={month} setMonth={setMonth} selected={katalogSel} onSelect={setKatalogSel} />;
    detail = katalogSel ? (
      <Detail wide={wide} label="Heft im Katalog" onClose={closeKatalog}><IssueDetail issueId={katalogSel} onClose={closeKatalog} /></Detail>
    ) : wide ? <Detail wide label="Heft im Katalog" onClose={closeKatalog}><EmptyDetail text="Tipp ein Heft an, um der Serie zu folgen oder es vorzumerken." /></Detail> : null;
  } else {
    list = <SerienList wide={wide} tab={serienTab} setTab={setSerienTab} sel={serienSel} onSelect={setSerienSel} />;
    const s = serienSel;
    const body =
      s?.kind === "event" ? <EventDetail key={s.id} eventId={s.id} onGone={closeSerien} /> :
      s?.kind === "series" ? <SeriesDetail key={s.id} seriesId={s.id} found={s.found} onSelect={setSerienSel} onGone={closeSerien} /> :
      s?.kind === "all" ? (
        <AllIssues key={s.id} seriesId={s.id} sel={s.sel}
          head={<BackButton onClick={() => setSerienSel({ kind: "series", id: s.id })}>{seriesLong(data?.series.get(s.id))}</BackButton>}
          onSelect={(id) => setSerienSel({ kind: "issue", id, back: { kind: "all", id: s.id, sel: id } })} />
      ) :
      s?.kind === "issue" ? (
        <>
          {s.back && <BackButton onClick={() => setSerienSel(s.back!)}>{s.back.kind === "all" ? "Alle Hefte" : seriesLong(data?.series.get(s.back.id))}</BackButton>}
          <IssueDetail issueId={s.id} onClose={closeSerien} />
        </>
      ) :
      wide ? <EmptyDetail text={serienTab === "serien" ? "Wähl links eine Serie." : serienTab === "events" ? "Wähl links ein Event oder leg ein neues an." : "Wähl links ein Heft von der Wunschliste."} /> : null;
    detail = body ? <Detail wide={wide} label="Serie im Detail" onClose={closeSerien}>{body}</Detail> : null;
  }

  return (
    <div className="app">
      <Nav tab={tab} counters={counters} />
      <div className="panes">
        <main className={`pane list ${wideList ? "wide" : ""}`}>
          {error && <p role="alert" className="stk" style={{ whiteSpace: "normal" }}>Fehler beim Laden: {error}</p>}
          {!data && !error ? <p className="d mut">LÄDT …</p> : list}
        </main>
        {data && detail}
      </div>
      {data && <InfiniteDrop />}
    </div>
  );
}
