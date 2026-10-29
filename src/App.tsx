import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { StoreProvider, useStore } from "./lib/store";
import { monthLabel, monthStart } from "./lib/dates";
import { Nav, TABS, type Tab } from "./components/Nav";
import { Detail, EmptyDetail } from "./components/Detail";
import { IssueDetail } from "./components/IssueDetail";
import { ImportForm } from "./components/ImportForm";
import { Login } from "./screens/Login";
import { PlanScreen } from "./screens/PlanScreen";
import { StapelList, StapelSeries, type StapelSel } from "./screens/StapelScreen";
import { KatalogList } from "./screens/KatalogScreen";
import { AddSeries, SerienList, SeriesDetail, type SerienSel, type SerienTab } from "./screens/SerienScreen";

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
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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
      s?.kind === "series" ? <StapelSeries seriesId={s.id} onSelect={setStapelSel} /> :
      s?.kind === "issue" ? (
        <>
          {wide && s.series && <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setStapelSel({ kind: "series", id: s.series! })}>← Zur Serie</button>}
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
      s?.kind === "add" ? <AddSeries onDone={(id) => setSerienSel({ kind: "series", id })} /> :
      s?.kind === "series" ? <SeriesDetail seriesId={s.id} onSelect={setSerienSel} onGone={closeSerien} /> :
      s?.kind === "issue" ? <IssueDetail issueId={s.id} onClose={closeSerien} /> :
      wide ? <EmptyDetail text={serienTab === "serien" ? "Wähl links eine Serie." : "Wähl links ein Heft von der Wunschliste."} /> : null;
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
    </div>
  );
}
