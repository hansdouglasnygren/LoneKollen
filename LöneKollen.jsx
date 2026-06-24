import { useState, useEffect, useMemo } from "react";

// ─── OB-motor (Handels Detaljhandelsavtalet, butik) ────────────────────────
// startMin / endMin = minuter från midnatt
function calcShiftPay(dagTyp, startMin, endMin, timlön) {
  if (endMin <= startMin) return 0;
  const h = (s, e) => Math.max(0, e - s) / 60;

  if (dagTyp === "söndag" || dagTyp === "röd") {
    return h(startMin, endMin) * timlön * 2;
  }
  if (dagTyp === "lördag") {
    const MID = 720; // 12:00
    return h(startMin, Math.min(endMin, MID)) * timlön +
           h(Math.max(startMin, MID), endMin) * timlön * 2;
  }
  // vardag
  const OB1 = 18 * 60 + 15; // 18:15
  const OB2 = 20 * 60;       // 20:00
  return h(startMin, Math.min(endMin, OB1))           * timlön       +
         h(Math.max(startMin, OB1), Math.min(endMin, OB2)) * timlön * 1.5 +
         h(Math.max(startMin, OB2), endMin)            * timlön * 1.7;
}

// ─── Rastberäkning (Handels) ───────────────────────────────────────────────
// < 5h   → ingen rast
// 5–6.5h → 30 min
// > 6.5h → 45 min
function getBreakMin(dagTyp) {
  return dagTyp === "vardag" ? 45 : 30;
}

// Wrapper som automatiskt drar av rast innan löneberäkning
function calcDayPay(dagTyp, startMin, endMin, timlön) {
  const breakMin = getBreakMin(dagTyp);
  return calcShiftPay(dagTyp, startMin, endMin - breakMin, timlön);
}

function minToHHMM(m) {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
}

function uid() { return Math.random().toString(36).slice(2, 9); }
function fmt(n) { return Math.round(n).toLocaleString("sv-SE") + " kr"; }
function fmtMonth(key) {
  const [y, m] = key.split("-");
  return new Date(+y, +m - 1).toLocaleString("sv-SE", { month: "long", year: "numeric" });
}
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function addMonths(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Defaults ──────────────────────────────────────────────────────────────
const DEF_SETTINGS = {
  timlön: 172,
  skatt: 30,
  semesterLön: true,
  semesterTyp: "månadsvis",
  tbStege: [
    { snitt: 0,    procent: 3 },
    { snitt: 5000, procent: 4 },
    { snitt: 7000, procent: 5 },
  ],
  defaults: {
    vardag:  { start: 9 * 60 + 45, end: 19 * 60,  prov: 400 },
    lördag:  { start: 10 * 60,      end: 17 * 60, prov: 400 },
    söndag:  { start: 11 * 60,      end: 17 * 60, prov: 400 },
    röd:     { start: 11 * 60,      end: 17 * 60, prov: 400 },
  },
};

const STOR_S  = "lonekollen-settings";
const STOR_M  = "lonekollen-months";
const STOR_OB = "lonekollen-onboarding-done";

function loadSettings() {
  try { return { ...DEF_SETTINGS, ...JSON.parse(localStorage.getItem(STOR_S) || "{}") }; }
  catch { return { ...DEF_SETTINGS }; }
}
function isOnboardingDone() {
  try { return localStorage.getItem(STOR_OB) === "1"; }
  catch { return true; }
}
function loadMonths() {
  try { return JSON.parse(localStorage.getItem(STOR_M) || "{}"); }
  catch { return {}; }
}

// ─── Färger ────────────────────────────────────────────────────────────────
const G = "#5bc500";   // Elgiganten-grön
const GD = "#3d8c00";  // mörkare grön
const N = "#002169";   // Elgiganten-navy
const ND = "#001435";  // mörkare navy (bakgrund)
const NC = "#00194d";  // kort-bakgrund

const DAG_META = {
  vardag:  { label: "Vardag",   emoji: "💼", color: "#5bc500" },
  lördag:  { label: "Lördag",  emoji: "🛒", color: "#f5a623" },
  söndag:  { label: "Söndag",  emoji: "☀️", color: "#e05c5c" },
  röd:     { label: "Röd dag", emoji: "🔴", color: "#e05c5c" },
};

// ─── Huvud-komponent ───────────────────────────────────────────────────────
export default function LöneKollen() {
  const [settings, setSettings] = useState(loadSettings);
  const [months, setMonths]     = useState(loadMonths);
  const [month, setMonth]       = useState(currentMonthKey);
  const [tab, setTab]           = useState("mån");
  const [addOpen, setAddOpen]   = useState(false);
  const [editId, setEditId]     = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone());
  const [stegeOpen, setStegeOpen]         = useState(false);
  const [bruttoOpen, setBruttoOpen]       = useState(false);
  const [kodModalOpen, setKodModalOpen]   = useState(false);
  const [expandPeriod, setExpandPeriod]   = useState(null); // period id som är expanderad
  const [dagsmålPopup, setDagsmålPopup]   = useState(null); // { förslag: number } | null
  const [expandPass, setExpandPass]       = useState({}); // { periodId/all: bool }

  // ── Gnistan-state ────────────────────────────────────────────────────────
  const [sparkTab, setSparkTab]       = useState("live");
  const [jobbläge, setJobbläge]       = useState("ledig");
  const [swipeStartX, setSwipeStartX] = useState(null);
  const [dagsmål, setDagsmål]         = useState(() => { try { return parseFloat(localStorage.getItem("lk-dagsmål")) || 10000; } catch { return 10000; } });
  const [celebration, setCelebration] = useState(null); // null | {nivå: 1|2|3, day, tbProv}
  const [planeraOpen, setPlaneraOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem("lk-dagsmål", dagsmål); } catch {} }, [dagsmål]);
  const [vadomTB, setVadomTB]         = useState("");
  const [drömSnitt, setDrömSnitt]     = useState("");
  const [nowMin, setNowMin]       = useState(() => { const d = new Date(); return d.getHours()*60+d.getMinutes()+d.getSeconds()/60; });
  const [sparkDagTyp, setSparkDagTyp] = useState("vardag");
  const [sparkStart, setSparkStart]   = useState(() => settings.defaults?.vardag?.start ?? 9*60+45);
  const [sparkEnd, setSparkEnd]       = useState(() => settings.defaults?.vardag?.end   ?? 19*60);
  const [sparkProv, setSparkProv]     = useState(() => settings.defaults?.vardag?.prov  ?? 400);
  const [sparkTB, setSparkTB]         = useState("");
  const [earlyMin, setEarlyMin]       = useState(30);

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours()*60 + d.getMinutes() + d.getSeconds()/60);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { try { localStorage.setItem(STOR_S, JSON.stringify(settings)); } catch {} }, [settings]);
  useEffect(() => { try { localStorage.setItem(STOR_M, JSON.stringify(months));   } catch {} }, [months]);

  const mData  = months[month]  || { days: [] };
  const days   = mData.days || [];
  const monthStege = mData.tbStege ?? settings.tbStege ?? [];

  // ── Perioder — ny multi-period struktur ──────────────────────────────────
  // mData.perioder = [{ id, namn, startDatum, slutDatum, tbStege, kpiMål, bonusAktiv, specialRegel }]
  // specialRegel: { aktiv, snittGräns, snittProcent, överskottProcent, tjänstKrav }
  // Fallback: om inga perioder finns används gamla tbStege/kpiMål för hela månaden
  const perioder = mData.perioder ?? null;

  function getDatumPeriod(datum) {
    if (!perioder || !datum) return null;
    return perioder.find(p => datum >= p.startDatum && datum <= p.slutDatum) ?? null;
  }

  // Auto-beräkna pass kvar från planerade
  const planerade      = mData.planerade ?? {};
  const planeradeArray = Array.isArray(planerade) ? planerade : []; // ny format
  const planeradeTotal = Array.isArray(planerade)
    ? planerade.length
    : (planerade.vardag ?? 0) + (planerade.lördag ?? 0) + (planerade.söndag ?? 0) + (planerade.röd ?? 0);
  const registrerade   = days.filter(d => d.passTyp !== "annan").length;
  const passKvar       = planeradeTotal > 0 ? Math.max(0, planeradeTotal - registrerade) : 5;

  function mutateMonth(fn) {
    setMonths(prev => {
      const cur = prev[month] || { days: [] };
      return { ...prev, [month]: fn(cur) };
    });
  }

  function mutateDays(fn) {
    mutateMonth(cur => ({ ...cur, days: fn(cur.days || []) }));
  }

  function saveMonthStege(stege) {
    mutateMonth(cur => ({ ...cur, tbStege: stege }));
  }

  function saveMonthKPI(kpiMål) {
    mutateMonth(cur => ({ ...cur, kpiMål }));
  }

  function saveMonthPerioder(nyaPerioder) {
    mutateMonth(cur => ({ ...cur, perioder: nyaPerioder }));
  }

  function savePlanerade(p) {
    mutateMonth(cur => ({ ...cur, planerade: p }));
  }

  function saveDay(day) {
    mutateDays(ds => {
      const idx = ds.findIndex(d => d.id === day.id);
      return idx >= 0 ? ds.map(d => d.id === day.id ? day : d) : [...ds, day];
    });
  }

  function deleteDay(id) { mutateDays(ds => ds.filter(d => d.id !== id)); }

  // ── Hjälpfunktion: beräkna provision för en grupp pass + en period-config ──
  function calcPeriodSummary(passDays, stege, kpiMål, specialRegel) {
    let totalTB = 0, säljDagar = 0;
    passDays.forEach(d => {
      if (d.passTyp !== "annan") { totalTB += (d.tb ?? 0); säljDagar++; }
    });
    const snittTB    = säljDagar > 0 ? totalTB / säljDagar : 0;
    const aktivStege = [...stege].reverse().find(s => snittTB >= s.snitt) ?? stege[0] ?? { procent: 0 };
    const nästaStege = stege.find(s => s.snitt > snittTB);

    const säljPass = passDays.filter(d => d.passTyp !== "annan");
    const kpiResults = (kpiMål ?? []).filter(k => k.aktiv !== false).map(kpi => {
      const vals  = säljPass.map(d => d.tjänster?.[kpi.namn] ?? d.tjänster?.[kpi.id] ?? 0);
      const snitt = vals.length > 0 ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
      const nådd  = snitt >= kpi.mål;
      return { ...kpi, snitt, nådd };
    });
    const kpiProcent = kpiResults.filter(k => k.nådd).reduce((s,k) => s + k.procent, 0);

    // Specialregel: snitt ≥ gräns → 7% på TB upp till (gräns × dagar), 10% på överskottet
    let tbProv = 0;
    let specialAktiverad = false;
    if (specialRegel?.aktiv && snittTB >= (specialRegel.snittGräns ?? 0)) {
      specialAktiverad = true;
      const snittProcent     = (specialRegel.snittProcent ?? 7) / 100;
      const överskottProcent = (specialRegel.överskottProcent ?? 10) / 100;
      const tbGräns = (specialRegel.snittGräns ?? 0) * säljDagar;
      const tbUnder = Math.min(totalTB, tbGräns);
      const tbÖver  = Math.max(0, totalTB - tbGräns);
      tbProv = tbUnder * snittProcent + tbÖver * överskottProcent;
    } else {
      const totalProcent = (aktivStege.procent + kpiProcent) / 100;
      tbProv = totalTB * totalProcent;
    }

    return { totalTB, snittTB, säljDagar, aktivStege, nästaStege, kpiResults, kpiProcent, tbProv, specialAktiverad };
  }

  // ── Summering ────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const manual   = mData.manualTB;
    const kpiMål   = mData.kpiMål ?? [];
    let baseLön = 0, obLön = 0, skottTotal = 0, bonusTotal = 0;

    days.forEach(d => {
      const breakMin = getBreakMin(d.dagTyp);
      const normal = ((d.endMin - d.startMin) - breakMin) / 60 * settings.timlön;
      const total  = calcDayPay(d.dagTyp, d.startMin, d.endMin, settings.timlön);
      baseLön += normal;
      obLön   += (total - normal);
      if (d.passTyp === "annan") skottTotal += (d.skott ?? 0);
      bonusTotal += (d.bonus ?? 0);
    });

    let tbProv = 0, totalTB = 0, säljDagar = 0;
    let aktivStege = monthStege[0] ?? { procent: 0 };
    let nästaStege = null;
    let kpiResults = [];
    let kpiProcent = 0;
    let periodSummaries = null; // fylls i om perioder finns

    if (manual) {
      totalTB    = manual.totalTB   ?? 0;
      säljDagar  = manual.säljDagar ?? 0;
      skottTotal = manual.skott     ?? 0;
      const snittTB = säljDagar > 0 ? totalTB / säljDagar : 0;
      aktivStege = [...monthStege].reverse().find(s => snittTB >= s.snitt) ?? monthStege[0] ?? { procent: 0 };
      nästaStege = monthStege.find(s => s.snitt > snittTB);
      tbProv = totalTB * (aktivStege.procent / 100);
    } else if (perioder && perioder.length > 0) {
      // ── Multi-period beräkning ──
      periodSummaries = perioder.map(p => {
        const pDays = days.filter(d => d.datum && d.datum >= p.startDatum && d.datum <= p.slutDatum);
        // Slå ihop period-KPI med månads-KPI för att matcha sparade tjänster-id:n
        const månadsKPIList = mData.kpiMål ?? [];
        const periodKPIList = p.kpiMål ?? [];
        const mergedKPI = [...månadsKPIList];
        periodKPIList.forEach(pk => {
          if (!mergedKPI.some(m => m.id === pk.id || m.namn === pk.namn)) {
            mergedKPI.push(pk);
          }
        });
        return {
          ...p,
          ...calcPeriodSummary(pDays, p.tbStege ?? [], mergedKPI, p.specialRegel),
          passDays: pDays,
        };
      });

      // Pass utan period (inget datum eller utanför alla perioder) → vanlig stege
      const oDays = days.filter(d => !d.datum || !perioder.some(p => d.datum >= p.startDatum && d.datum <= p.slutDatum));
      let oProv = 0, oTB = 0, oSälj = 0;
      oDays.forEach(d => { if (d.passTyp !== "annan") { oTB += (d.tb ?? 0); oSälj++; } });
      if (oSälj > 0) {
        const oSnitt = oTB / oSälj;
        const oStege = [...monthStege].reverse().find(s => oSnitt >= s.snitt) ?? monthStege[0] ?? { procent: 0 };
        oProv = oTB * (oStege.procent / 100);
      }

      tbProv = periodSummaries.reduce((s, p) => s + p.tbProv, 0) + oProv;
      totalTB = periodSummaries.reduce((s, p) => s + p.totalTB, 0) + oTB;
      säljDagar = periodSummaries.reduce((s, p) => s + p.säljDagar, 0) + oSälj;
      // Använd sista perioden för aktivStege/nästaStege (visas i gnistan)
      const sistaPeriod = periodSummaries[periodSummaries.length - 1];
      aktivStege = sistaPeriod?.aktivStege ?? monthStege[0] ?? { procent: 0 };
      nästaStege = sistaPeriod?.nästaStege ?? null;
      kpiResults = sistaPeriod?.kpiResults ?? [];
      kpiProcent = sistaPeriod?.kpiProcent ?? 0;
    } else {
      days.forEach(d => {
        if (d.passTyp !== "annan") { totalTB += (d.tb ?? 0); säljDagar++; }
      });
      const snittTB = säljDagar > 0 ? totalTB / säljDagar : 0;
      aktivStege = [...monthStege].reverse().find(s => snittTB >= s.snitt) ?? monthStege[0] ?? { procent: 0 };
      nästaStege = monthStege.find(s => s.snitt > snittTB);
      kpiResults = kpiMål.filter(k => k.aktiv !== false).map(kpi => {
        const säljPass = days.filter(d => d.passTyp !== "annan");
        const vals = säljPass.map(d => d.tjänster?.[kpi.namn] ?? d.tjänster?.[kpi.id] ?? 0);
        const snitt = vals.length > 0 ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
        const nådd = snitt >= kpi.mål;
        return { ...kpi, snitt, nådd };
      });
      kpiProcent = kpiResults.filter(k => k.nådd).reduce((s,k) => s + k.procent, 0);
      tbProv = totalTB * (aktivStege.procent + kpiProcent) / 100;
    }

    const snittTB = säljDagar > 0 ? totalTB / säljDagar : 0;
    const provTotal  = tbProv + skottTotal + bonusTotal;
    const brutto   = baseLön + obLön + provTotal;
    const netto    = brutto * (1 - settings.skatt / 100);
    const nettoSem = netto * 1.13;
    return { baseLön, obLön, tbProv, skottTotal, bonusTotal, provTotal, brutto, netto, nettoSem,
             totalTB, snittTB, säljDagar, aktivStege, nästaStege, isManual: !!manual,
             kpiResults, kpiProcent, periodSummaries };
  }, [days, settings, monthStege, mData.manualTB, mData.kpiMål, perioder]);

  // ── Historik ─────────────────────────────────────────────────────────────
  const historyMonths = useMemo(() => {
    return Object.keys(months)
      .filter(k => k <= month)
      .sort()
      .slice(-6)
      .map(k => {
        const md   = months[k] || {};
        const ds   = md.days || [];
        const stege = md.tbStege ?? settings.tbStege ?? [];
        let b = 0, totalTB = 0, säljDagar = 0;
        ds.forEach(d => {
          b += calcDayPay(d.dagTyp, d.startMin, d.endMin, settings.timlön);
          if (d.passTyp === "annan") { b += (d.skott ?? 0); }
          else { totalTB += (d.tb ?? 0); säljDagar++; }
        });
        const snitt = säljDagar > 0 ? totalTB / säljDagar : 0;
        const aktiv = [...stege].reverse().find(s => snitt >= s.snitt) ?? stege[0] ?? { procent: 0 };
        b += totalTB * (aktiv.procent / 100);
        const n = b * (1 - settings.skatt / 100);
        return { key: k, brutto: b, netto: n, dagar: ds.length };
      });
  }, [months, month, settings]);

  const maxBrutto = Math.max(...historyMonths.map(h => h.brutto), 1);

  // ── Gemensamma stilar ─────────────────────────────────────────────────────
  const cardStyle = {
    background: NC, borderRadius: 16,
    border: `1px solid ${N}`, padding: "16px 18px",
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Outfit:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${ND}; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        .spark-tabs::-webkit-scrollbar { display: none; }
        input:focus { outline: none; }
        button:active { opacity: 0.8; }
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: ND, fontFamily: "Outfit, sans-serif", paddingBottom: 80 }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{ background: N, padding: "18px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{
                color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                fontSize: 22, letterSpacing: 2, textTransform: "uppercase",
              }}>LÖNEKOLLEN</div>
              <div style={{ color: "#6688bb", fontSize: 12, marginTop: 1 }}>Elgiganten · Handels OB</div>
            </div>
            {tab === "mån" && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                {/* Provision-knapp */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <button onClick={() => setStegeOpen(true)} style={{
                    background: N, border: `1px solid ${G}44`, borderRadius: 12,
                    color: G, fontWeight: 700, fontSize: 18,
                    width: 42, height: 42, cursor: "pointer", lineHeight: 1,
                  }}>⚙️</button>
                  <div style={{ color: "#5577aa", fontSize: 9, fontWeight: 600, letterSpacing: 0.5 }}>PROVISION</div>
                </div>
                {/* Pass-knapp */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <button onClick={() => setAddOpen(true)} style={{
                    background: G, border: "none", borderRadius: 12,
                    color: "#001435", fontWeight: 700, fontSize: 22,
                    width: 42, height: 42, cursor: "pointer", lineHeight: 1,
                  }}>+</button>
                  <div style={{ color: "#5577aa", fontSize: 9, fontWeight: 600, letterSpacing: 0.5 }}>PASS</div>
                </div>
              </div>
            )}
          </div>

          {/* Månadsväljare (bara på mån-fliken) */}
          {tab === "mån" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <button onClick={() => setMonth(m => addMonths(m, -1))} style={{
                background: "transparent", border: `1px solid ${N}`, color: "#8899cc",
                borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 18,
              }}>‹</button>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 16, textTransform: "capitalize" }}>
                {fmtMonth(month)}
              </div>
              <button onClick={() => setMonth(m => addMonths(m, 1))} style={{
                background: "transparent", border: `1px solid ${N}`, color: "#8899cc",
                borderRadius: 10, width: 36, height: 36, cursor: "pointer", fontSize: 18,
              }}>›</button>
            </div>
          )}

          {/* Fliknavigation */}
          <div style={{ display: "flex", gap: 0 }}>
            {[["mån","Månad"],["gnistan","⚡ Gnistan"],["historik","Historik"],["inst","Inst."]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                background: "transparent", fontFamily: "Outfit, sans-serif",
                fontWeight: 600, fontSize: key === "gnistan" ? 13 : 14,
                color: tab === key ? (key === "gnistan" ? "#f5a623" : G) : "#4466aa",
                borderBottom: tab === key ? `3px solid ${key === "gnistan" ? "#f5a623" : G}` : "3px solid transparent",
                transition: "color .15s",
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: "18px 16px 0" }}>

          {/* ════════════════ MÅNADSVY ════════════════ */}
          {tab === "mån" && (<>

            {/* ── HERO-KORT: Brutto · Netto · Semesterlön ── */}
            <div style={{ marginBottom: 14 }}>
              <div onClick={() => setBruttoOpen(o => !o)} style={{
                background: N, borderRadius: bruttoOpen ? "16px 16px 0 0" : 16,
                padding: "18px 18px 14px", cursor: "pointer",
                borderBottom: bruttoOpen ? `1px solid ${ND}` : "none",
                transition: "border-radius .2s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ color: "#5577aa", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Brutto denna månad</div>
                    <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 38, lineHeight: 1 }}>{fmt(summary.brutto)}</div>
                    <div style={{ color: "#5577aa", fontSize: 11, marginTop: 6, display: "flex", flexWrap: "wrap", gap: "0 12px" }}>
                      <span>Timlön {fmt(summary.baseLön + summary.obLön)}</span>
                      {summary.tbProv > 0 && <span>Provision {fmt(summary.tbProv)}</span>}
                      {summary.bonusTotal > 0 && <span>🏆 {fmt(summary.bonusTotal)}</span>}
                    </div>
                  </div>
                  <div style={{ color: "#5577aa", fontSize: 18, marginTop: 4 }}>{bruttoOpen ? "▲" : "▼"}</div>
                </div>
              </div>
              {bruttoOpen && (
                <div style={{ background: NC, padding: "12px 18px", borderBottom: `1px solid ${ND}` }}>
                  {[
                    ["Baslön", summary.baseLön, null],
                    ["OB-tillägg", summary.obLön, null],
                    ...(summary.periodSummaries
                      ? summary.periodSummaries.map(p => [`${p.namn} provision`, p.tbProv, p.specialAktiverad ? "#f5a623" : null])
                      : [[`TB-provision (${summary.aktivStege?.procent ?? 0}%)`, summary.totalTB * (summary.aktivStege?.procent ?? 0) / 100, null]]),
                    ...(summary.kpiResults?.filter(k => k.nådd).map(k => [`✅ KPI: ${k.namn} (+${k.procent}%)`, summary.totalTB * k.procent / 100, G]) ?? []),
                    ...(summary.skottTotal > 0 ? [["Skottpengar", summary.skottTotal, null]] : []),
                    ...(summary.bonusTotal > 0 ? [["🏆 Tävlingsbonus", summary.bonusTotal, "#f5a623"]] : []),
                  ].map(([label, val, color], i, arr) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < arr.length - 1 ? `1px solid ${N}` : "none" }}>
                      <span style={{ color: "#6688bb", fontSize: 13 }}>{label}</span>
                      <span style={{ color: color ?? (val > 0 ? "#c8deff" : "#334"), fontWeight: 600, fontFamily: "Rajdhani, sans-serif", fontSize: 14 }}>{fmt(val)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex" }}>
                <div style={{ flex: 1, background: NC, padding: "14px 18px", borderRight: `1px solid ${ND}`, borderRadius: "0 0 0 16px" }}>
                  <div style={{ color: "#5577aa", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Netto ({settings.skatt}%)</div>
                  <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 22 }}>{fmt(summary.netto)}</div>
                </div>
                {settings.semesterLön && (
                  <div style={{ flex: 1, background: `${G}18`, padding: "14px 18px", borderRadius: "0 0 16px 0" }}>
                    <div style={{ color: "#5bc58877", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
                      {settings.semesterTyp === "månadsvis" ? "Ink. sem. +13%" : "Sem. intjänad"}
                    </div>
                    <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 22 }}>
                      {settings.semesterTyp === "månadsvis" ? fmt(summary.nettoSem) : fmt(summary.nettoSem - summary.netto)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pass-räknare */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              {(summary.isManual ? [
                ["💼 Vardagar",  mData.manualDagar?.vardagar   ?? 0, null],
                ["🛒 Lördagar",  mData.manualDagar?.lördagar   ?? 0, null],
                ["☀️ Söndagar",  mData.manualDagar?.söndagar   ?? 0, null],
                ["🔴 Röda",      mData.manualDagar?.röda       ?? 0, null],
                ["🔧 Kassa",     mData.manualDagar?.kassaDagar ?? 0, null],
              ].filter(([,v]) => v > 0) : [
                ["📋 Pass",      days.length,                                              planeradeTotal > 0 ? planeradeTotal : null],
                ["💼 Vardagar",  days.filter(d => d.dagTyp === "vardag").length,           Array.isArray(planerade) ? planeradeArray.filter(p => p.dagTyp === "vardag").length || null : planerade.vardag ?? null],
                ["🛒 Lördagar",  days.filter(d => d.dagTyp === "lördag").length,           Array.isArray(planerade) ? planeradeArray.filter(p => p.dagTyp === "lördag").length || null : planerade.lördag ?? null],
                ["☀️ Söndagar",  days.filter(d => d.dagTyp === "söndag").length,           Array.isArray(planerade) ? planeradeArray.filter(p => p.dagTyp === "söndag").length || null : planerade.söndag ?? null],
                ["🔴 Röda",      days.filter(d => d.dagTyp === "röd").length,              Array.isArray(planerade) ? planeradeArray.filter(p => p.dagTyp === "röd").length || null : planerade.röd ?? null],
              ].filter(([, val, plan]) => val > 0 || (plan !== null && plan > 0))
              ).map(([label, val, plan]) => (
                <div key={label} style={{ background: ND, border: `1px solid ${N}`, borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11 }}>{label.split(" ")[0]}</span>
                  <span style={{ color: "#5577aa", fontSize: 11 }}>{label.split(" ")[1]}</span>
                  <span style={{ color: val > 0 ? G : "#334", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 14 }}>
                    {val}{plan !== null ? <span style={{ color: "#5577aa", fontWeight: 500 }}>/{plan}</span> : ""}
                  </span>
                </div>
              ))}
              <button onClick={() => setPlaneraOpen(true)} style={{
                background: "transparent", border: `1px solid ${N}`,
                borderRadius: 8, color: "#5577aa", fontSize: 12,
                padding: "5px 10px", cursor: "pointer", fontFamily: "Outfit, sans-serif",
              }}>✏️ Planera</button>
            </div>

            {/* Expanderbara period-kort med inbyggd passlista */}
            {summary.periodSummaries ? (
              <div style={{ marginBottom: 14 }}>
                {summary.periodSummaries.map((p, pi) => {
                  const pFärg = pi === 0 ? "#5577aa" : "#f5a623";
                  const pExpanded = expandPeriod === p.id;
                  const pSnitt = p.säljDagar > 0 ? p.totalTB / p.säljDagar : 0;
                  const pStege = p.tbStege ?? [];
                  const pNästa = pStege.find(s => s.snitt > pSnitt);
                  const pTbGräns = p.specialRegel?.aktiv ? (p.specialRegel.snittGräns ?? 0) * p.säljDagar : 0;
                  const pTillgodo = p.totalTB - (p.aktivStege?.snitt ?? 0) * p.säljDagar;
                  const pÖverskott = pTillgodo >= 0;
                  const pDays = days.filter(d => d.datum && d.datum >= p.startDatum && d.datum <= p.slutDatum)
                    .sort((a,b) => b.datum.localeCompare(a.datum));
                  const passExpanded = expandPass[p.id] !== false; // default öppet
                  return (
                    <div key={p.id} style={{ marginBottom: 10 }}>
                      {/* Period-huvud */}
                      <div onClick={() => setExpandPeriod(pExpanded ? null : p.id)} style={{
                        background: NC, border: `2px solid ${pExpanded ? pFärg : `${pFärg}44`}`,
                        borderRadius: pExpanded ? "14px 14px 0 0" : 14,
                        padding: "14px 16px", cursor: "pointer",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ color: pFärg, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5 }}>
                                {p.namn || `Period ${pi + 1}`}
                              </div>
                              {p.specialAktiverad && <div style={{ background: "#f5a62333", border: "1px solid #f5a62366", borderRadius: 20, padding: "2px 8px", fontSize: 10, color: "#f5a623" }}>💎 Special</div>}
                            </div>
                            <div style={{ color: "#5577aa", fontSize: 11, marginTop: 2 }}>
                              {p.startDatum?.slice(5).replace("-","/")} – {p.slutDatum?.slice(5).replace("-","/")} · {p.säljDagar} pass
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ color: p.specialAktiverad ? "#f5a623" : G, fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 22 }}>{fmt(p.tbProv)}</div>
                              <div style={{ color: "#5577aa", fontSize: 10 }}>provision</div>
                            </div>
                            <div style={{ color: "#5577aa", fontSize: 16 }}>{pExpanded ? "▲" : "▼"}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                          {[["TB", `${Math.round(p.totalTB).toLocaleString("sv-SE")} kr`], ["Snitt", `${Math.round(pSnitt).toLocaleString("sv-SE")} kr`], ["Serie", p.specialAktiverad ? "💎" : `${(p.aktivStege?.procent ?? 0) + (p.kpiProcent ?? 0)}%`]].map(([lbl, val]) => (
                            <div key={lbl} style={{ flex: 1, background: ND, borderRadius: 8, padding: "6px 8px" }}>
                              <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>{lbl}</div>
                              <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 13 }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Expanderad provision-info */}
                      {pExpanded && (
                        <div style={{ background: "#001030", border: `2px solid ${pFärg}`, borderTop: "none", padding: "14px 16px", borderRadius: pDays.length > 0 ? "0" : "0 0 14px 14px" }}>
                          {p.specialRegel?.aktiv && (
                            <div style={{ background: p.specialAktiverad ? "#1a1200" : "#0d0d1a", border: `1px solid ${p.specialAktiverad ? "#f5a62355" : "#334"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                              <div style={{ color: p.specialAktiverad ? "#f5a623" : "#5577aa", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                                💎 Specialregel: snitt ≥ {(p.specialRegel.snittGräns ?? 0).toLocaleString("sv-SE")} kr/dag
                              </div>
                              {p.specialAktiverad ? (
                                <div style={{ color: "#c8a055", fontSize: 11 }}>
                                  {p.specialRegel.snittProcent ?? 7}% × {Math.round(Math.min(p.totalTB, pTbGräns)).toLocaleString("sv-SE")} kr
                                  {p.totalTB > pTbGräns ? ` + ${p.specialRegel.överskottProcent ?? 10}% × ${Math.round(p.totalTB - pTbGräns).toLocaleString("sv-SE")} kr överskott` : ""}
                                </div>
                              ) : (
                                <div style={{ color: "#5577aa", fontSize: 11 }}>
                                  Höj snittet med {Math.max(0, Math.round((p.specialRegel.snittGräns ?? 0) - pSnitt)).toLocaleString("sv-SE")} kr/dag för att aktivera
                                </div>
                              )}
                            </div>
                          )}
                          {!p.specialRegel?.aktiv && (
                            <div style={{ background: pÖverskott ? `${G}15` : "#1a0000", border: `1px solid ${pÖverskott ? GD : "#aa2222"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>TB tillgodo på {p.aktivStege?.procent ?? 0}%-nivån</div>
                                <div style={{ color: "#5577aa", fontSize: 11 }}>{Math.round(p.totalTB).toLocaleString("sv-SE")} − {Math.round((p.aktivStege?.snitt ?? 0) * p.säljDagar).toLocaleString("sv-SE")} kr</div>
                              </div>
                              <div style={{ color: pÖverskott ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 22 }}>
                                {pÖverskott ? "+" : ""}{Math.round(pTillgodo).toLocaleString("sv-SE")} kr
                              </div>
                            </div>
                          )}
                          {pNästa && !p.specialAktiverad && (
                            <div style={{ background: ND, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ color: "#5577aa", fontSize: 11 }}>Snitt: {Math.round(pSnitt).toLocaleString("sv-SE")} kr/dag</span>
                                <span style={{ color: pFärg, fontSize: 11, fontWeight: 700 }}>Mål: {pNästa.snitt.toLocaleString("sv-SE")} kr/dag</span>
                              </div>
                              <div style={{ height: 6, background: "#001435", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                                <div style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${pFärg}88,${pFärg})`, width: `${Math.min(100, (pSnitt / pNästa.snitt) * 100)}%`, transition: "width .4s" }} />
                              </div>
                              <div style={{ color: "#5577aa", fontSize: 11, textAlign: "center" }}>
                                +{Math.round(pNästa.snitt - pSnitt).toLocaleString("sv-SE")} kr/dag → {pNästa.procent}%
                              </div>
                            </div>
                          )}
                          {p.kpiResults?.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {p.kpiResults.map(kpi => (
                                <div key={kpi.id} style={{ background: kpi.nådd ? `${G}15` : "#1a0000", border: `1px solid ${kpi.nådd ? GD : "#aa2222"}`, borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ color: kpi.nådd ? G : "#5577aa", fontSize: 12 }}>{kpi.nådd ? "✅" : "⬜"} {kpi.namn} · {kpi.snitt.toFixed(1)}/{kpi.mål} st</div>
                                  <div style={{ color: kpi.nådd ? G : "#5577aa", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 14 }}>+{kpi.procent}%</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Kollapsbar passlista per period */}
                      <div style={{ border: `2px solid ${pFärg}44`, borderTop: "none", borderRadius: pExpanded ? "0 0 14px 14px" : (pDays.length > 0 ? "0 0 14px 14px" : 0) }}>
                        <div onClick={() => setExpandPass(prev => ({ ...prev, [p.id]: !passExpanded }))} style={{
                          background: "#001030", padding: "10px 16px", cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          borderRadius: passExpanded ? 0 : "0 0 12px 12px",
                        }}>
                          <div style={{ color: pFärg, fontSize: 11, fontWeight: 700 }}>
                            📋 {pDays.length} pass registrerade
                          </div>
                          <div style={{ color: "#5577aa", fontSize: 14 }}>{passExpanded ? "▲" : "▼"}</div>
                        </div>
                        {passExpanded && pDays.length > 0 && (
                          <div style={{ background: ND, borderRadius: "0 0 12px 12px", padding: "8px 10px" }}>
                            {pDays.map(day => {
                              const meta = DAG_META[day.dagTyp];
                              const pay  = calcDayPay(day.dagTyp, day.startMin, day.endMin, settings.timlön);
                              const prov = day.passTyp === "annan" ? (day.skott ?? 0) : 0;
                              const bonus = day.bonus ?? 0;
                              const tbProv = day.passTyp === "sälj"
                                ? (day.tb ?? 0) * ((p.aktivStege?.procent ?? 0) + (p.kpiProcent ?? 0)) / 100
                                : 0;
                              const tot = pay + prov + bonus + tbProv;
                              const h = (day.endMin - day.startMin) / 60;
                              return (
                                <div key={day.id} style={{ ...cardStyle, marginBottom: 8, borderLeft: `4px solid ${meta.color}`, animation: "slideUp .2s ease" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <span style={{ fontSize: 18 }}>{meta.emoji}</span>
                                      <div>
                                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{meta.label}{day.datum ? <span style={{ color: "#5577aa", fontWeight: 400, fontSize: 11 }}> · {day.datum.slice(5).replace("-", "/")}</span> : ""}</div>
                                        <div style={{ color: "#5577aa", fontSize: 11 }}>{minToHHMM(day.startMin)} – {minToHHMM(day.endMin)} · {h.toFixed(1).replace(".", ",")}h</div>
                                      </div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                      <div style={{ color: G, fontWeight: 700, fontFamily: "Rajdhani, sans-serif", fontSize: 16 }}>{fmt(tot)}</div>
                                      {day.tb > 0 && <div style={{ color: "#5577aa", fontSize: 10 }}>TB {Math.round(day.tb).toLocaleString("sv-SE")} kr{bonus > 0 ? ` · 🏆+${bonus}` : ""}</div>}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <button onClick={() => { setEditId(day.id); setAddOpen(true); }} style={{ flex: 1, padding: "6px 0", background: "transparent", border: `1px solid ${N}`, borderRadius: 8, color: "#6688bb", cursor: "pointer", fontSize: 12, fontFamily: "Outfit, sans-serif" }}>Redigera</button>
                                    <button onClick={() => { if (window.confirm(`Ta bort passet?`)) deleteDay(day.id); }} style={{ padding: "6px 12px", background: "transparent", border: "1px solid #440000", borderRadius: 8, color: "#884444", cursor: "pointer", fontSize: 12, fontFamily: "Outfit, sans-serif" }}>✕</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {passExpanded && pDays.length === 0 && (
                          <div style={{ background: ND, borderRadius: "0 0 12px 12px", padding: "16px", textAlign: "center", color: "#4466aa", fontSize: 13 }}>
                            Inga pass registrerade för denna period
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Pass utan period */}
                {(() => {
                  const oDays = days.filter(d => !d.datum || !perioder.some(p => d.datum >= p.startDatum && d.datum <= p.slutDatum))
                    .sort((a,b) => (b.datum ?? "").localeCompare(a.datum ?? ""));
                  if (oDays.length === 0) return null;
                  const passExpanded = expandPass["other"] !== false;
                  return (
                    <div style={{ marginBottom: 10, border: `2px solid #33444444`, borderRadius: 14 }}>
                      <div onClick={() => setExpandPass(prev => ({ ...prev, other: !passExpanded }))} style={{
                        background: NC, padding: "12px 16px", cursor: "pointer", borderRadius: passExpanded ? "12px 12px 0 0" : 12,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div style={{ color: "#5577aa", fontSize: 12, fontWeight: 700 }}>📋 Övriga pass ({oDays.length})</div>
                        <div style={{ color: "#5577aa", fontSize: 14 }}>{passExpanded ? "▲" : "▼"}</div>
                      </div>
                      {passExpanded && (
                        <div style={{ background: ND, borderRadius: "0 0 12px 12px", padding: "8px 10px" }}>
                          {oDays.map(day => {
                            const meta = DAG_META[day.dagTyp];
                            const pay  = calcDayPay(day.dagTyp, day.startMin, day.endMin, settings.timlön);
                            const bonus = day.bonus ?? 0;
                            const tot = pay + (day.skott ?? 0) + bonus;
                            return (
                              <div key={day.id} style={{ ...cardStyle, marginBottom: 8, borderLeft: `4px solid ${meta.color}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>{meta.emoji}</span>
                                    <div>
                                      <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{meta.label}{day.datum ? <span style={{ color: "#5577aa", fontSize: 11 }}> · {day.datum.slice(5).replace("-", "/")}</span> : ""}</div>
                                      <div style={{ color: "#5577aa", fontSize: 11 }}>{minToHHMM(day.startMin)} – {minToHHMM(day.endMin)}</div>
                                    </div>
                                  </div>
                                  <div style={{ color: G, fontWeight: 700, fontFamily: "Rajdhani, sans-serif", fontSize: 16 }}>{fmt(tot)}</div>
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                  <button onClick={() => { setEditId(day.id); setAddOpen(true); }} style={{ flex: 1, padding: "6px 0", background: "transparent", border: `1px solid ${N}`, borderRadius: 8, color: "#6688bb", cursor: "pointer", fontSize: 12, fontFamily: "Outfit, sans-serif" }}>Redigera</button>
                                  <button onClick={() => { if (window.confirm("Ta bort passet?")) deleteDay(day.id); }} style={{ padding: "6px 12px", background: "transparent", border: "1px solid #440000", borderRadius: 8, color: "#884444", cursor: "pointer", fontSize: 12, fontFamily: "Outfit, sans-serif" }}>✕</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              // Ingen period — enkel kollapsbar passlista
              <div style={{ marginBottom: 14 }}>
                {/* TB-sektion utan perioder */}
                {summary.säljDagar > 0 && (
              <div style={{ ...cardStyle, marginBottom: 14, border: `1px solid ${GD}` }}>

                {/* ── HERO: Total provision-% + KPI-badges ── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${N}` }}>
                  <div>
                    <div style={{ color: "#5577aa", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Total provision</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 44, lineHeight: 1 }}>
                        {(summary.aktivStege?.procent ?? 0) + (summary.kpiProcent ?? 0)}%
                      </div>
                      <div style={{ color: "#5577aa", fontSize: 12 }}>av TB</div>
                    </div>
                    <div style={{ color: "#5577aa", fontSize: 11, marginTop: 4 }}>
                      {fmt(summary.tbProv)} · {summary.säljDagar} säljdagar
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    {/* Serie-badge */}
                    <div style={{ background: `${G}20`, border: `1px solid ${GD}`, borderRadius: 20, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14 }}>
                        {summary.nästaStege ? "🥈" : "🥇"}
                      </span>
                      <span style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 14 }}>{summary.aktivStege?.procent}%</span>
                    </div>
                    {/* KPI-badges */}
                    {summary.kpiResults?.map(kpi => (
                      <div key={kpi.id} style={{
                        background: kpi.nådd ? `${G}20` : "#1a0000",
                        border: `1px solid ${kpi.nådd ? GD : "#aa2222"}`,
                        borderRadius: 20, padding: "4px 12px",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <span style={{ fontSize: 12 }}>{kpi.nådd ? "✅" : "⬜"}</span>
                        <span style={{ color: kpi.nådd ? G : "#5577aa", fontSize: 12, fontWeight: 600 }}>
                          {kpi.namn} +{kpi.procent}%
                        </span>
                        <span style={{ color: kpi.nådd ? G : "#5577aa", fontSize: 11 }}>
                          ({kpi.snitt.toFixed(1)}/{kpi.mål})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── TB-stats ── */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, background: ND, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Total TB</div>
                    <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>{Math.round(summary.totalTB).toLocaleString("sv-SE")} kr</div>
                  </div>
                  <div style={{ flex: 1, background: ND, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Snitt/dag</div>
                    <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>{Math.round(summary.snittTB).toLocaleString("sv-SE")} kr</div>
                  </div>
                </div>

                {/* ── Serie-status / Tillgodo ── */}
                {summary.nästaStege ? (() => {
                  const extraKr        = summary.totalTB * (summary.nästaStege.procent - summary.aktivStege.procent) / 100;
                  const extraNetto     = extraKr * (1 - settings.skatt / 100);
                  const projTB         = summary.totalTB + (passKvar * summary.nästaStege.snitt);
                  const projExtraKr    = projTB * (summary.nästaStege.procent - summary.aktivStege.procent) / 100;
                  const projExtraNetto = projExtraKr * (1 - settings.skatt / 100);
                  const goldSnitt      = summary.aktivStege?.snitt ?? 0;
                  const tbTillgodo     = summary.totalTB - goldSnitt * summary.säljDagar;
                  const överskott      = tbTillgodo >= 0;
                  return (<>
                    {/* TB tillgodo */}
                    <div style={{
                      background: överskott ? `${G}15` : "#1a0000",
                      border: `1px solid ${överskott ? GD : "#aa2222"}`,
                      borderRadius: 10, padding: "10px 14px", marginBottom: 8,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>TB tillgodo på {summary.aktivStege?.procent}%-nivån</div>
                        <div style={{ color: "#5577aa", fontSize: 11 }}>{Math.round(summary.totalTB).toLocaleString("sv-SE")} − {Math.round(goldSnitt * summary.säljDagar).toLocaleString("sv-SE")} kr</div>
                      </div>
                      <div style={{ color: överskott ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 22 }}>
                        {överskott ? "+" : ""}{Math.round(tbTillgodo).toLocaleString("sv-SE")} kr
                      </div>
                    </div>
                    {/* KPI tillgodo */}
                    {summary.kpiResults?.filter(k => k.aktiv !== false).map(kpi => {
                      const kpiDiff = Math.round(kpi.snitt * summary.säljDagar - kpi.mål * summary.säljDagar);
                      const kpiPlus = kpiDiff >= 0;
                      return (
                        <div key={kpi.id} style={{
                          background: kpiPlus ? `${G}15` : "#1a0000",
                          border: `1px solid ${kpiPlus ? GD : "#aa2222"}`,
                          borderRadius: 10, padding: "10px 14px", marginBottom: 8,
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <div>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{kpi.namn} tillgodo</div>
                            <div style={{ color: "#5577aa", fontSize: 11 }}>{(kpi.snitt * summary.säljDagar).toFixed(1)} / {(kpi.mål * summary.säljDagar).toFixed(0)} st krävs</div>
                          </div>
                          <div style={{ color: kpiPlus ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 22 }}>
                            {kpiPlus ? "+" : ""}{kpiDiff} st
                          </div>
                        </div>
                      );
                    })}
                    {/* Om du når nästa stege */}
                    <div style={{ background: "#0d1f00", border: "2px solid #f5a62366", borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ color: "#f5a62399", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                        💰 Om du når {summary.nästaStege.procent}%-serien
                      </div>
                      <div style={{ color: "#5577aa", fontSize: 11, marginBottom: 6 }}>På redan tjänade {Math.round(summary.totalTB).toLocaleString("sv-SE")} kr TB</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: passKvar > 0 ? 12 : 0 }}>
                        <div style={{ background: "#0a0a00", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Brutto</div>
                          <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>+{fmt(extraKr)}</div>
                        </div>
                        <div style={{ background: "#0a0a00", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Netto ({settings.skatt}%)</div>
                          <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>+{fmt(extraNetto)}</div>
                        </div>
                      </div>
                      {passKvar > 0 && (<>
                        <div style={{ borderTop: "1px solid #f5a62222", paddingTop: 10, marginBottom: 6 }}>
                          <div style={{ color: "#5577aa", fontSize: 11 }}>Hela månaden inkl {passKvar} pass kvar</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div style={{ background: "#0a0a00", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Brutto</div>
                            <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>+{fmt(projExtraKr)}</div>
                          </div>
                          <div style={{ background: "#051a05", borderRadius: 10, padding: "10px 12px", border: `1px solid ${GD}` }}>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Netto ({settings.skatt}%)</div>
                            <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>+{fmt(projExtraNetto)}</div>
                          </div>
                        </div>
                        <div style={{ color: "#5577aa", fontSize: 11, textAlign: "center", marginTop: 8 }}>
                          Höj snittet med {Math.round(summary.nästaStege.snitt - summary.snittTB).toLocaleString("sv-SE")} kr/dag
                        </div>
                      </>)}
                    </div>
                  </>);
                })() : (() => {
                  const goldSnitt  = summary.aktivStege?.snitt ?? 0;
                  const tbTillgodo = summary.totalTB - goldSnitt * summary.säljDagar;
                  const överskott  = tbTillgodo >= 0;
                  return (<>
                    <div style={{ background: `${G}20`, border: `1px solid ${GD}`, borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                      <div style={{ color: G, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏆 Högsta serien!</div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Ditt snitt</div>
                          <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>{Math.round(summary.snittTB).toLocaleString("sv-SE")} kr/dag</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Guldgräns</div>
                          <div style={{ color: "#5577aa", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>{goldSnitt.toLocaleString("sv-SE")} kr/dag</div>
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: överskott ? `${G}15` : "#1a0000",
                      border: `1px solid ${överskott ? GD : "#aa2222"}`,
                      borderRadius: 10, padding: "10px 14px", marginBottom: 8,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <div>
                        <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>TB tillgodo på guldnivån</div>
                        <div style={{ color: "#5577aa", fontSize: 11 }}>{Math.round(summary.totalTB).toLocaleString("sv-SE")} − {Math.round(goldSnitt * summary.säljDagar).toLocaleString("sv-SE")} kr</div>
                      </div>
                      <div style={{ color: överskott ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 22 }}>
                        {överskott ? "+" : ""}{Math.round(tbTillgodo).toLocaleString("sv-SE")} kr
                      </div>
                    </div>
                    {summary.kpiResults?.filter(k => k.aktiv !== false).map(kpi => {
                      const kpiDiff = Math.round(kpi.snitt * summary.säljDagar - kpi.mål * summary.säljDagar);
                      const kpiPlus = kpiDiff >= 0;
                      return (
                        <div key={kpi.id} style={{
                          background: kpiPlus ? `${G}15` : "#1a0000",
                          border: `1px solid ${kpiPlus ? GD : "#aa2222"}`,
                          borderRadius: 10, padding: "10px 14px",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <div>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{kpi.namn} tillgodo</div>
                            <div style={{ color: "#5577aa", fontSize: 11 }}>{(kpi.snitt * summary.säljDagar).toFixed(1)} / {(kpi.mål * summary.säljDagar).toFixed(0)} st krävs</div>
                          </div>
                          <div style={{ color: kpiPlus ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 22 }}>
                            {kpiPlus ? "+" : ""}{kpiDiff} st
                          </div>
                        </div>
                      );
                    })}
                  </>);
                })()}
              </div>
            )}

                {/* Kollapsbar passlista */}
                {(() => {
                  const allPassExpanded = expandPass["all"] !== false;
                  const sortedDays = [...days].sort((a,b) => {
                    if (a.datum && b.datum) return b.datum.localeCompare(a.datum);
                    return (b.registrerad ?? 0) - (a.registrerad ?? 0);
                  });
                  return (
                    <div style={{ border: `1px solid ${N}`, borderRadius: 14 }}>
                      <div onClick={() => setExpandPass(prev => ({ ...prev, all: !allPassExpanded }))} style={{
                        background: NC, padding: "12px 16px", cursor: "pointer",
                        borderRadius: allPassExpanded ? "12px 12px 0 0" : 12,
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div style={{ color: G, fontSize: 12, fontWeight: 700 }}>📋 {days.length} pass registrerade</div>
                        <div style={{ color: "#5577aa", fontSize: 14 }}>{allPassExpanded ? "▲" : "▼"}</div>
                      </div>
                      {allPassExpanded && (
                        <div style={{ background: ND, borderRadius: "0 0 12px 12px", padding: "8px 10px" }}>
                          {days.length === 0 && (
                            <div style={{ textAlign: "center", padding: "24px 0", color: "#4466aa" }}>
                              <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                              Tryck + för att lägga till ditt första pass
                            </div>
                          )}
                          {sortedDays.map(day => {
                            const meta = DAG_META[day.dagTyp];
                            const pay  = calcDayPay(day.dagTyp, day.startMin, day.endMin, settings.timlön);
                            const prov = day.passTyp === "annan" ? (day.skott ?? 0) : 0;
                            const bonus = day.bonus ?? 0;
                            const tbProv = day.passTyp === "sälj"
                              ? (day.tb ?? 0) * ((summary.aktivStege?.procent ?? 0) + (summary.kpiProcent ?? 0)) / 100
                              : 0;
                            const tot = pay + prov + bonus + tbProv;
                            const h = (day.endMin - day.startMin) / 60;
                            return (
                              <div key={day.id} style={{ ...cardStyle, marginBottom: 8, borderLeft: `4px solid ${meta.color}`, animation: "slideUp .2s ease" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                                    <div>
                                      <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{meta.label}{day.datum ? <span style={{ color: "#5577aa", fontWeight: 400, fontSize: 12 }}> · {day.datum.slice(5).replace("-", "/")}</span> : ""}</div>
                                      <div style={{ color: "#5577aa", fontSize: 12 }}>{minToHHMM(day.startMin)} – {minToHHMM(day.endMin)} &nbsp;·&nbsp; {h.toFixed(2).replace(".", ",")}h</div>
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ color: G, fontWeight: 700, fontFamily: "Rajdhani, sans-serif", fontSize: 18 }}>{fmt(tot)}</div>
                                    {day.passTyp === "annan"
                                      ? <div style={{ color: "#f5a623", fontSize: 11 }}>skott {fmt(day.skott ?? 0)}</div>
                                      : day.tb > 0 ? <div style={{ color: "#5577aa", fontSize: 11 }}>TB {Math.round(day.tb).toLocaleString("sv-SE")} kr{bonus > 0 ? ` · 🏆 +${bonus}` : ""}</div> : null
                                    }
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                  <button onClick={() => { setEditId(day.id); setAddOpen(true); }} style={{ flex: 1, padding: "7px 0", background: "transparent", border: `1px solid ${N}`, borderRadius: 8, color: "#6688bb", cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif" }}>Redigera</button>
                                  <button onClick={() => { if (window.confirm(`Ta bort ${meta.label}-passet?`)) deleteDay(day.id); }} style={{ padding: "7px 14px", background: "transparent", border: "1px solid #440000", borderRadius: 8, color: "#884444", cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif" }}>✕</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </>)}

          {/* ════════════════ GNISTAN ════════════════ */}
          {tab === "gnistan" && (() => {
            const sparkBreak    = getBreakMin(sparkDagTyp);
            const clampedNow    = Math.min(Math.max(nowMin, sparkStart), sparkEnd);
            const elapsed       = Math.max(0, clampedNow - sparkStart);
            const totalMin      = Math.max(1, sparkEnd - sparkStart);
            const remaining     = Math.max(0, sparkEnd - clampedNow);
            const progress      = sparkEnd > sparkStart ? elapsed / totalMin : 0;
            const provSoFar     = sparkProv * (elapsed / totalMin);
            const earnedSoFar   = calcShiftPay(sparkDagTyp, sparkStart, Math.max(sparkStart, clampedNow - sparkBreak*(elapsed/totalMin)), settings.timlön) + provSoFar;
            const earnedNetto   = earnedSoFar * (1 - settings.skatt / 100);
            const fullPay       = calcDayPay(sparkDagTyp, sparkStart, sparkEnd, settings.timlön) + sparkProv;
            const fullNetto     = fullPay * (1 - settings.skatt / 100);
            const earlyPay      = calcDayPay(sparkDagTyp, sparkStart, sparkEnd - earlyMin, settings.timlön) + sparkProv*((totalMin-earlyMin)/totalMin);
            const lostByLeaving = fullPay - earlyPay;
            const krPerMin      = fullPay / totalMin;
            const krPerMinNetto = fullNetto / totalMin;
            const isWorking     = nowMin >= sparkStart && nowMin < sparkEnd;
            const isAfter       = nowMin >= sparkEnd;

            const todayTB       = parseFloat(sparkTB) || 0;
            // ── Gnistan: använd senaste aktiva period om perioder finns ──────
            const gnistanPeriod = summary.periodSummaries
              ? summary.periodSummaries[summary.periodSummaries.length - 1]
              : null;

            const säljDays      = days.filter(d => d.passTyp !== "annan");
            // Om perioder: filtrera säljpass till aktuell period
            const aktivaPeriodDays = gnistanPeriod
              ? days.filter(d => d.passTyp !== "annan" && d.datum && d.datum >= gnistanPeriod.startDatum && d.datum <= gnistanPeriod.slutDatum)
              : säljDays;

            const befintligTB   = aktivaPeriodDays.reduce((s,d) => s + (d.tb ?? 0), 0);
            const nyTotalTB     = befintligTB + todayTB;
            const nySäljDagar   = aktivaPeriodDays.length + (todayTB > 0 ? 1 : 0);
            const nySnitt       = nySäljDagar > 0 ? nyTotalTB / nySäljDagar : 0;
            const stege         = gnistanPeriod ? (gnistanPeriod.tbStege ?? []) : monthStege;
            const aktivTier     = [...stege].reverse().find(s => nySnitt >= s.snitt) ?? stege[0] ?? { procent: 0 };
            const nästaStegeTB  = stege.find(s => s.snitt > nySnitt);
            const nyProv        = nyTotalTB * (aktivTier.procent / 100);
            const gammalSnitt   = aktivaPeriodDays.length > 0 ? befintligTB / aktivaPeriodDays.length : 0;
            const gammalTier    = [...stege].reverse().find(s => gammalSnitt >= s.snitt) ?? stege[0] ?? { procent: 0 };
            const gammalProv    = befintligTB * (gammalTier.procent / 100);
            const tbBidrag      = nyProv - gammalProv;

            const curTotalTB    = gnistanPeriod ? gnistanPeriod.totalTB : summary.totalTB;
            const curSäljDagar  = gnistanPeriod ? gnistanPeriod.säljDagar : summary.säljDagar;
            const curSnitt      = curSäljDagar > 0 ? curTotalTB / curSäljDagar : 0;
            const nästaStege_   = gnistanPeriod ? (stege.find(s => s.snitt > curSnitt) ?? null) : summary.nästaStege;
            const aktivStege_   = gnistanPeriod ? gnistanPeriod.aktivStege : summary.aktivStege;

            const totalPassKvar = Math.max(1, passKvar);
            const neededSnittNästa = nästaStege_?.snitt ?? 0;
            const neededTBNästa  = Math.max(0, neededSnittNästa * (curSäljDagar + totalPassKvar) - curTotalTB);
            const neededPerPassNästa = neededTBNästa / totalPassKvar;

            const lowerStege    = [...stege].reverse().find(s => s.snitt < aktivStege_?.snitt);
            const bufferPerPass = lowerStege
              ? ((curSnitt - lowerStege.snitt) * curSäljDagar) / Math.max(1, curSäljDagar)
              : null;

            const bestPass      = [...säljDays].sort((a,b) => (b.tb??0) - (a.tb??0))[0];

            const sortedPasses  = [...säljDays];
            let streak = 0;
            for (let i = sortedPasses.length - 1; i >= 0; i--) {
              if ((sortedPasses[i].tb ?? 0) >= dagsmål) streak++;
              else break;
            }
            const passedGoal    = säljDays.filter(d => (d.tb ?? 0) >= dagsmål).length;

            const vadomVal      = parseFloat(vadomTB) || 0;
            const vadomNyTotal  = curTotalTB + vadomVal;
            const vadomNySälj   = curSäljDagar + (vadomVal > 0 ? 1 : 0);
            const vadomSnitt    = vadomNySälj > 0 ? vadomNyTotal / vadomNySälj : 0;
            const vadomTier     = [...stege].reverse().find(s => vadomSnitt >= s.snitt) ?? stege[0] ?? { procent: 0 };
            const vadomProv     = vadomNyTotal * (vadomTier.procent / 100);
            const vadomDelta    = vadomProv - (curTotalTB * (aktivStege_?.procent ?? 0) / 100);
            const tierChanged   = vadomTier.procent !== (aktivStege_?.procent ?? 0);

            const subTabs = [
              ["live", "⚡ Live"],
              ["mål",  "🎯 Mål"],
              ["bästa","🌟 Bästa"],
              ["tempo","📊 Tempo"],
              ["stats","🏆 Stats"],
              ["fakta","🧠 Fakta"],
            ];
            const tabIndex = subTabs.findIndex(([k]) => k === sparkTab);

            const säljPassar = days.filter(d => d.passTyp !== "annan");
            const bästaTB    = [...säljPassar].sort((a,b) => (b.tb??0)-(a.tb??0))[0];
            const bästaTjänster = mData.kpiMål?.length > 0
              ? [...säljPassar].sort((a,b) => {
                  const sumA = Object.values(a.tjänster??{}).reduce((s,v)=>s+v,0);
                  const sumB = Object.values(b.tjänster??{}).reduce((s,v)=>s+v,0);
                  return sumB - sumA;
                })[0]
              : null;
            const bästaLön = [...days].sort((a,b) => {
              const lönA = calcDayPay(a.dagTyp,a.startMin,a.endMin,settings.timlön) + (a.bonus??0) + (a.tb??0)*((summary.aktivStege?.procent??0)+(summary.kpiProcent??0))/100;
              const lönB = calcDayPay(b.dagTyp,b.startMin,b.endMin,settings.timlön) + (b.bonus??0) + (b.tb??0)*((summary.aktivStege?.procent??0)+(summary.kpiProcent??0))/100;
              return lönB - lönA;
            })[0];

            return (
              <div
                onTouchStart={e => setSwipeStartX(e.touches[0].clientX)}
                onTouchEnd={e => {
                  if (swipeStartX === null) return;
                  const diff = swipeStartX - e.changedTouches[0].clientX;
                  if (Math.abs(diff) > 50) {
                    const idx = subTabs.findIndex(([k]) => k === sparkTab);
                    if (diff > 0 && idx < subTabs.length - 1) setSparkTab(subTabs[idx+1][0]);
                    if (diff < 0 && idx > 0) setSparkTab(subTabs[idx-1][0]);
                  }
                  setSwipeStartX(null);
                }}
              >
                {/* Sub-tab bar */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "none", msOverflowStyle: "none" }}>
                    {subTabs.map(([key, label]) => (
                      <button key={key} onClick={() => setSparkTab(key)} style={{
                        flexShrink: 0, padding: "7px 12px", border: "none", borderRadius: 20,
                        background: sparkTab === key ? "#f5a623" : NC,
                        color: sparkTab === key ? "#001435" : "#5577aa",
                        fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "Outfit, sans-serif",
                        whiteSpace: "nowrap", transition: "background .15s, color .15s",
                      }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 4 }}>
                    {subTabs.map(([key]) => (
                      <div key={key} style={{
                        width: sparkTab === key ? 16 : 4, height: 4, borderRadius: 2,
                        background: sparkTab === key ? "#f5a623" : "#334",
                        transition: "width .2s, background .2s",
                      }} />
                    ))}
                  </div>
                </div>

                {/* ── LIVE ── */}
                {sparkTab === "live" && (
                  <div>
                    <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                      {[["ledig","😴 Ledig"],["jobb","💼 På jobbet"]].map(([key,label]) => (
                        <button key={key} onClick={() => setJobbläge(key)} style={{
                          flex:1, padding:"14px 0", borderRadius:14, cursor:"pointer",
                          fontWeight:700, fontSize:15, fontFamily:"Outfit, sans-serif",
                          background: jobbläge === key ? (key === "jobb" ? G : "#0d0d1a") : NC,
                          color: jobbläge === key ? (key === "jobb" ? "#001435" : "#fff") : "#5577aa",
                          border: jobbläge === key ? (key === "jobb" ? "none" : `1px solid #333`) : `1px solid ${N}`,
                        }}>{label}</button>
                      ))}
                    </div>

                    {/* ── LEDIG-VY ── */}
                    {jobbläge === "ledig" && (() => {
                      const tierIndex   = stege.indexOf(aktivStege_) >= 0 ? stege.indexOf(aktivStege_) : stege.findIndex(s => s.procent === aktivStege_?.procent);
                      const totalTiers  = stege.length;
                      const medal       = tierIndex >= totalTiers - 1 ? { emoji:"🥇", label:"Guld", color:"#FFD700", bg:"#2a2000" }
                                        : tierIndex === totalTiers - 2 ? { emoji:"🥈", label:"Silver", color:"#C0C0C0", bg:"#1a1a1a" }
                                        : { emoji:"🥉", label:"Brons", color:"#cd7f32", bg:"#1a0e00" };
                      return (
                        <div>
                          <div style={{ background: medal.bg, border:`2px solid ${medal.color}44`, borderRadius:20, padding:"24px 20px", marginBottom:14, textAlign:"center" }}>
                            <div style={{ fontSize:52, marginBottom:8 }}>{medal.emoji}</div>
                            <div style={{ color: medal.color, fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:28, letterSpacing:1 }}>{medal.label}-serie</div>
                            <div style={{ color: medal.color, fontSize:32, fontFamily:"Rajdhani, sans-serif", fontWeight:700, marginTop:4 }}>{aktivStege_?.procent ?? 0}% provision</div>
                            <div style={{ color:"#5577aa", fontSize:13, marginTop:8 }}>på {curSäljDagar} säljdagar · snitt {Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag</div>
                          </div>

                          {nästaStege_ ? (
                            <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                              <div style={{ color:"#5577aa", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:2, marginBottom:10 }}>
                                Nästa nivå — {stege[tierIndex+1]?.emoji ?? "🥇"} {tierIndex >= totalTiers - 2 ? "Guld" : tierIndex >= totalTiers - 3 ? "Silver" : "Brons"} {nästaStege_.procent}%
                              </div>
                              <div style={{ height:10, background:ND, borderRadius:5, overflow:"hidden", marginBottom:8 }}>
                                <div style={{ height:"100%", borderRadius:5, background:`linear-gradient(90deg,${medal.color}88,${medal.color})`, width:`${Math.min(100,(curSnitt/nästaStege_.snitt)*100)}%`, transition:"width .4s" }} />
                              </div>
                              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                                <span style={{ color:"#5577aa", fontSize:11 }}>{Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag</span>
                                <span style={{ color: medal.color, fontSize:11, fontWeight:700 }}>{Math.round((curSnitt/nästaStege_.snitt)*100)}%</span>
                                <span style={{ color:"#5577aa", fontSize:11 }}>{nästaStege_.snitt.toLocaleString("sv-SE")} kr/dag</span>
                              </div>
                              <div style={{ background:ND, borderRadius:10, padding:"10px 14px", textAlign:"center" }}>
                                <span style={{ color:"#5577aa", fontSize:12 }}>Du behöver höja snittet med </span>
                                <span style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:16 }}> {Math.round(nästaStege_.snitt - curSnitt).toLocaleString("sv-SE")} kr/dag</span>
                              </div>
                            </div>
                          ) : (
                            <div style={{ background:`${G}15`, border:`1px solid ${GD}`, borderRadius:16, padding:"16px 18px", textAlign:"center", marginBottom:14 }}>
                              <div style={{ color:G, fontWeight:700, fontSize:15, marginBottom:4 }}>🏆 Du är på högsta nivån!</div>
                              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}><span style={{ color:"#5577aa", fontSize:12 }}>Snitt: {Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag</span><span style={{ color:"#5577aa", fontSize:12 }}>Gräns: {(aktivStege_?.snitt ?? 0).toLocaleString("sv-SE")} kr/dag</span></div>
                            </div>
                          )}

                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                            {[
                              ["Total TB", Math.round(curTotalTB).toLocaleString("sv-SE") + " kr"],
                              ["TB-provision", fmt(curTotalTB * (aktivStege_?.procent ?? 0) / 100)],
                            ].map(([label,val]) => (
                              <div key={label} style={{ background:NC, border:`1px solid ${N}`, borderRadius:12, padding:"12px 14px" }}>
                                <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>{label}</div>
                                <div style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:18 }}>{val}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── PÅ JOBBET-VY ── */}
                    {jobbläge === "jobb" && (
                      <div>
                        <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
                          <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Dagens pass</div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                            {["vardag","lördag","söndag","röd"].map(typ => {
                              const m = DAG_META[typ];
                              return (
                                <button key={typ} onClick={() => {
                                  setSparkDagTyp(typ);
                                  const d = settings.defaults?.[typ];
                                  if (d) { setSparkStart(d.start); setSparkEnd(d.end); setSparkProv(d.prov ?? 400); }
                                }} style={{
                                  flex: 1, padding: "8px 4px", border: "none", borderRadius: 8,
                                  background: sparkDagTyp === typ ? m.color : ND,
                                  color: sparkDagTyp === typ ? "#001435" : "#5577aa",
                                  fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "Outfit, sans-serif",
                                }}>{m.emoji} {m.label}</button>
                              );
                            })}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            {[["Start", sparkStart, setSparkStart], ["Slut", sparkEnd, setSparkEnd]].map(([lbl, val, setter]) => (
                              <div key={lbl}>
                                <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{lbl}</div>
                                <input type="time" value={minToHHMM(val)}
                                  onChange={e => { const [h,m] = e.target.value.split(":").map(Number); setter(h*60+m); }}
                                  style={{ width:"100%", background: ND, border:`1px solid ${N}`, color:"#f5a623", borderRadius:8, padding:"8px 6px", fontSize:14, fontFamily:"Rajdhani, sans-serif", fontWeight:700, colorScheme:"dark" }}
                                />
                              </div>
                            ))}
                            <div>
                              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Prov.</div>
                              <input type="number" value={sparkProv} step={50} min={0}
                                onChange={e => setSparkProv(parseFloat(e.target.value)||0)}
                                style={{ width:"100%", background: ND, border:`1px solid ${N}`, color:"#f5a623", borderRadius:8, padding:"8px 6px", fontSize:14, fontFamily:"Rajdhani, sans-serif", fontWeight:700 }}
                              />
                            </div>
                          </div>
                        </div>

                        <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
                          <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>📊 Dagens TB (kr)</div>
                          <input type="number" value={sparkTB} step={500} min={0} placeholder="Ange ditt TB..."
                            onChange={e => setSparkTB(e.target.value)}
                            style={{ width:"100%", background: ND, border:`1px solid #f5a62355`, color:"#f5a623", borderRadius:10, padding:"12px 16px", fontSize:20, fontFamily:"Rajdhani, sans-serif", fontWeight:700, marginBottom: todayTB > 0 ? 12 : 0 }}
                          />
                          {todayTB > 0 && (
                            <div style={{ background:`${G}12`, border:`1px solid ${GD}`, borderRadius:10, padding:"12px 14px", marginTop: 8 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                                <div>
                                  <div style={{ color:"#5577aa", fontSize:11 }}>Nytt snitt ({nySäljDagar} dagar)</div>
                                  <div style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:18 }}>{Math.round(nySnitt).toLocaleString("sv-SE")} kr/dag</div>
                                </div>
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ color:"#5577aa", fontSize:11 }}>Serie</div>
                                  <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:18 }}>{aktivTier.procent}%</div>
                                </div>
                              </div>
                              <div style={{ display:"flex", justifyContent:"space-between", paddingTop:8, borderTop:`1px solid ${N}` }}>
                                <span style={{ color:"#5577aa", fontSize:12 }}>Provisionsbidrag idag</span>
                                <span style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:16 }}>+{fmt(Math.max(0, tbBidrag))}</span>
                              </div>
                              {nästaStegeTB ? (
                                <div style={{ color:"#5577aa", fontSize:11, textAlign:"center", marginTop:6 }}>
                                  {(nästaStegeTB.snitt - nySnitt).toLocaleString("sv-SE")} kr/dag till {nästaStegeTB.procent}%-serien
                                </div>
                              ) : (
                                <div style={{ marginTop:6, background:`${G}20`, borderRadius:8, padding:"8px 10px" }}>
                                  <div style={{ color:G, fontSize:11, fontWeight:700, marginBottom:4 }}>🏆 Högsta serien!</div>
                                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                                    <span style={{ color:"#5577aa", fontSize:11 }}>Snitt: {Math.round(nySnitt).toLocaleString("sv-SE")} kr/dag</span>
                                    <span style={{ color:"#5577aa", fontSize:11 }}>Gräns: {(aktivTier?.snitt ?? 0).toLocaleString("sv-SE")} kr/dag</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ background: isWorking ? "#0d1f00" : NC, border:`2px solid ${isWorking ? "#f5a623" : "#334"}`, borderRadius:20, padding:"20px 18px", marginBottom:14, textAlign:"center" }}>
                          {isAfter ? (<>
                            <div style={{ fontSize:32, marginBottom:6 }}>✅</div>
                            <div style={{ color:G, fontSize:13, fontWeight:600, marginBottom:4 }}>Passet är klart!</div>
                            <div style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:32 }}>{fmt(fullNetto)}</div>
                            <div style={{ color:"#5577aa", fontSize:12, marginTop:4 }}>efter skatt · brutto {fmt(fullPay)}</div>
                          </>) : isWorking ? (<>
                            <div style={{ color:"#f5a62399", fontSize:11, fontWeight:600, textTransform:"uppercase", letterSpacing:2, marginBottom:8 }}>⚡ Tjänat hittills</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                              <div style={{ background:"#001435", borderRadius:12, padding:"12px" }}>
                                <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Netto</div>
                                <div style={{ color:"#f5a623", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:28, lineHeight:1 }}>{Math.round(earnedNetto).toLocaleString("sv-SE")} kr</div>
                              </div>
                              <div style={{ background:"#001435", borderRadius:12, padding:"12px" }}>
                                <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Brutto</div>
                                <div style={{ color:"#8899cc", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:28, lineHeight:1 }}>{Math.round(earnedSoFar).toLocaleString("sv-SE")} kr</div>
                              </div>
                            </div>
                            <div style={{ color:"#5577aa", fontSize:12, margin:"6px 0 12px" }}>{Math.floor(elapsed/60)}h {Math.round(elapsed%60)}min jobbat · {Math.floor(remaining/60)}h {Math.round(remaining%60)}min kvar</div>
                            <div style={{ height:8, background:"#001435", borderRadius:4, overflow:"hidden", marginBottom:10 }}>
                              <div style={{ height:"100%", borderRadius:4, background:"linear-gradient(90deg,#f5a623,#5bc500)", width:`${progress*100}%`, transition:"width 1s linear" }} />
                            </div>
                            <div style={{ color:"#5577aa", fontSize:12 }}>≈ {krPerMinNetto.toFixed(2)} kr/min netto · {fmt(krPerMinNetto*60)}/timme</div>
                          </>) : (<>
                            <div style={{ fontSize:28, marginBottom:8 }}>🕐</div>
                            <div style={{ color:"#4466aa", fontSize:14 }}>Passet börjar {minToHHMM(sparkStart)}</div>
                            <div style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:26, marginTop:8 }}>{fmt(fullNetto)}</div>
                            <div style={{ color:"#5577aa", fontSize:12 }}>förväntat netto för hela passet</div>
                          </>)}
                        </div>

                        <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px" }}>
                          <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:14 }}>💸 Vad förlorar du på att gå hem tidigt?</div>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0, marginBottom:16 }}>
                            <button onClick={() => setEarlyMin(m => Math.max(15, m-15))} style={{ width:44, height:44, borderRadius:"12px 0 0 12px", background:"#f5a62322", border:"1px solid #f5a62355", color:"#f5a623", fontSize:22, fontWeight:900, cursor:"pointer" }}>−</button>
                            <div style={{ width:100, height:44, background:ND, display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid #f5a62355", borderLeft:"none", borderRight:"none", color:"#f5a623", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:20 }}>{earlyMin} min</div>
                            <button onClick={() => setEarlyMin(m => Math.min(240, m+15))} style={{ width:44, height:44, borderRadius:"0 12px 12px 0", background:"#f5a62322", border:"1px solid #f5a62355", color:"#f5a623", fontSize:22, fontWeight:900, cursor:"pointer" }}>+</button>
                          </div>
                          <div style={{ background:"#2a0808", border:"1px solid #aa2222", borderRadius:12, padding:"14px 16px", marginBottom:12, textAlign:"center" }}>
                            <div style={{ color:"#cc6666", fontSize:11, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Du förlorar</div>
                            <div style={{ color:"#ff6666", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:34 }}>−{fmt(Math.max(0, lostByLeaving))}</div>
                            <div style={{ color:"#cc6666", fontSize:12, marginTop:4 }}>om du går hem {earlyMin} min tidigt ({minToHHMM(Math.max(sparkStart, sparkEnd-earlyMin))})</div>
                          </div>
                          <div style={{ display:"flex", gap:6 }}>
                            {[15,30,60,120].map(m => {
                              const loss = Math.max(0, fullPay - calcDayPay(sparkDagTyp, sparkStart, sparkEnd-m, settings.timlön) - sparkProv);
                              return (
                                <button key={m} onClick={() => setEarlyMin(m)} style={{ flex:1, padding:"8px 0", background: earlyMin===m ? "#2a0808" : "transparent", border:`1px solid ${earlyMin===m ? "#aa2222" : "#334"}`, borderRadius:8, cursor:"pointer", fontFamily:"Outfit, sans-serif" }}>
                                  <div style={{ color: earlyMin===m ? "#ff6666" : "#5577aa", fontSize:10, fontWeight:700 }}>{m}min</div>
                                  <div style={{ color: earlyMin===m ? "#ff4444" : "#334", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:12 }}>−{Math.round(loss).toLocaleString("sv-SE")}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── MÅL ── */}
                {sparkTab === "mål" && (
                  <div>
                    {/* Pass kvar */}
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>🎯 Pass kvar denna månad</div>
                      {planeradeTotal > 0 ? (
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div>
                            <div style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:42, lineHeight:1 }}>{passKvar}</div>
                            <div style={{ color:"#5577aa", fontSize:12, marginTop:4 }}>pass kvar av {planeradeTotal} planerade · {registrerade} klara</div>
                          </div>
                          <div style={{ background: ND, borderRadius: 10, padding: "8px 12px", textAlign:"right" }}>
                            <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1 }}>Framsteg</div>
                            <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:18 }}>{Math.round(registrerade/planeradeTotal*100)}%</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ color:"#4466aa", fontSize:13, textAlign:"center", padding:"8px 0" }}>
                          Tryck ✏️ Planera på månadsfliken för att sätta antal pass
                        </div>
                      )}
                    </div>

                    {/* Dagsmål + högsta stege — två mål-kort */}
                    {(() => {
                      const högstalStege = [...stege].sort((a,b) => b.snitt - a.snitt)[0];
                      const högstalSnitt = högstalStege?.snitt ?? 0;

                      // Mål 1: Eget dagsmål
                      const mål1 = dagsmål;
                      const mål1Nådd = curSnitt >= mål1;
                      const mål1Pct = mål1 > 0 ? Math.min(100, (curSnitt / mål1) * 100) : 0;
                      const mål1KvarPerPass = passKvar > 0 && !mål1Nådd
                        ? Math.max(0, (mål1 * (curSäljDagar + passKvar) - curTotalTB) / passKvar)
                        : 0;

                      // Mål 2: Högsta stegen
                      const mål2 = högstalSnitt;
                      const mål2Nådd = curSnitt >= mål2;
                      const mål2Pct = mål2 > 0 ? Math.min(100, (curSnitt / mål2) * 100) : 0;
                      const mål2KvarPerPass = passKvar > 0 && !mål2Nådd
                        ? Math.max(0, (mål2 * (curSäljDagar + passKvar) - curTotalTB) / passKvar)
                        : 0;

                      function MålKort({ emoji, titel, målSnitt, nådd, pct, kvarPerPass, färg, procent }) {
                        return (
                          <div style={{ background: nådd ? `${färg}20` : NC, border:`2px solid ${nådd ? färg : `${färg}44`}`, borderRadius:14, padding:"16px", marginBottom:12 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                              <div>
                                <div style={{ color: färg, fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, marginBottom:4 }}>{emoji} {titel}</div>
                                <div style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:28 }}>{målSnitt.toLocaleString("sv-SE")} kr/dag</div>
                                {procent && <div style={{ color:"#5577aa", fontSize:11, marginTop:2 }}>{procent}% provision</div>}
                              </div>
                              {nådd
                                ? <div style={{ background:`${färg}33`, borderRadius:20, padding:"6px 14px", color: färg, fontWeight:700, fontSize:13 }}>✅ Nådd!</div>
                                : <div style={{ background: ND, borderRadius:20, padding:"6px 14px", color:"#5577aa", fontWeight:700, fontSize:13 }}>{Math.round(pct)}%</div>
                              }
                            </div>
                            <div style={{ height:8, background:ND, borderRadius:4, overflow:"hidden", marginBottom:8 }}>
                              <div style={{ height:"100%", borderRadius:4, background:`linear-gradient(90deg,${färg}88,${färg})`, width:`${pct}%`, transition:"width .4s" }} />
                            </div>
                            <div style={{ display:"flex", justifyContent:"space-between" }}>
                              <span style={{ color:"#5577aa", fontSize:11 }}>Snitt nu: {Math.round(curSnitt).toLocaleString("sv-SE")} kr</span>
                              {!nådd && kvarPerPass > 0 && (
                                <span style={{ color: färg, fontSize:11, fontWeight:700 }}>Behöver {Math.ceil(kvarPerPass).toLocaleString("sv-SE")} kr/pass</span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (<>
                        <MålKort
                          emoji="🔥"
                          titel="Ditt dagsmål"
                          målSnitt={mål1}
                          nådd={mål1Nådd}
                          pct={mål1Pct}
                          kvarPerPass={mål1KvarPerPass}
                          färg="#f5a623"
                          procent={null}
                        />
                        {mål2 > 0 && mål2 !== mål1 && (
                          <MålKort
                            emoji="👑"
                            titel={`Högsta serien (${högstalStege?.procent ?? 0}%)`}
                            målSnitt={mål2}
                            nådd={mål2Nådd}
                            pct={mål2Pct}
                            kvarPerPass={mål2KvarPerPass}
                            färg={G}
                            procent={högstalStege?.procent}
                          />
                        )}

                        {/* Värt att kämpa för — nästa opnådda mål */}
                        {(() => {
                          const närmasteMål = !mål1Nådd ? mål1 : !mål2Nådd ? mål2 : null;
                          const närmasteProcent = !mål1Nådd ? null : högstalStege?.procent;
                          if (!närmasteMål || curTotalTB === 0) return null;
                          const extraKr = närmasteProcent
                            ? curTotalTB * (närmasteProcent - (aktivStege_?.procent ?? 0)) / 100
                            : 0;
                          const extraNetto = extraKr * (1 - settings.skatt / 100);
                          const projTB = curTotalTB + passKvar * närmasteMål;
                          const projExtraKr = närmasteProcent ? projTB * (närmasteProcent - (aktivStege_?.procent ?? 0)) / 100 : 0;
                          const projExtraNetto = projExtraKr * (1 - settings.skatt / 100);
                          if (!närmasteProcent) return null;
                          return (
                            <div style={{ background:"#0d1f00", border:"2px solid #f5a62366", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                              <div style={{ color:"#f5a62399", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>💰 Värt att kämpa för</div>
                              <div style={{ color:"#5577aa", fontSize:11, marginBottom:8 }}>På redan tjänade {Math.round(curTotalTB).toLocaleString("sv-SE")} kr TB</div>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom: passKvar > 0 ? 12 : 0 }}>
                                <div style={{ background:"#0a0a00", borderRadius:10, padding:"10px 12px" }}>
                                  <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Brutto</div>
                                  <div style={{ color:"#f5a623", fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:20 }}>+{fmt(extraKr)}</div>
                                </div>
                                <div style={{ background:"#0a0a00", borderRadius:10, padding:"10px 12px" }}>
                                  <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Netto ({settings.skatt}%)</div>
                                  <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:20 }}>+{fmt(extraNetto)}</div>
                                </div>
                              </div>
                              {passKvar > 0 && (<>
                                <div style={{ borderTop:"1px solid #f5a62222", paddingTop:10, marginBottom:8 }}>
                                  <div style={{ color:"#5577aa", fontSize:11 }}>Hela månaden inkl {passKvar} pass kvar</div>
                                </div>
                                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                                  <div style={{ background:"#0a0a00", borderRadius:10, padding:"10px 12px" }}>
                                    <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Brutto</div>
                                    <div style={{ color:"#f5a623", fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:20 }}>+{fmt(projExtraKr)}</div>
                                  </div>
                                  <div style={{ background:"#051a05", borderRadius:10, padding:"10px 12px", border:`1px solid ${GD}` }}>
                                    <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Netto ({settings.skatt}%)</div>
                                    <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:20 }}>+{fmt(projExtraNetto)}</div>
                                  </div>
                                </div>
                              </>)}
                            </div>
                          );
                        })()}
                      </>);
                    })()}

                    {/* Dagsmål-inställning */}
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px" }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>🔥 Ändra ditt dagsmål (kr TB)</div>
                      <input type="number" value={dagsmål} step={1000} min={0}
                        onChange={e => setDagsmål(parseFloat(e.target.value)||0)}
                        style={{ width:"100%", background:ND, border:`1px solid #f5a62355`, color:"#f5a623", borderRadius:10, padding:"12px 16px", fontSize:20, fontFamily:"Rajdhani, sans-serif", fontWeight:700 }}
                      />
                      <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
                        {[...stege].sort((a,b) => a.snitt - b.snitt).filter(s => s.snitt > 0).map(s => (
                          <button key={s.snitt} onClick={() => setDagsmål(s.snitt)} style={{
                            padding:"5px 10px", background: dagsmål === s.snitt ? "#f5a62333" : ND,
                            border:`1px solid ${dagsmål === s.snitt ? "#f5a623" : "#334"}`,
                            borderRadius:8, color: dagsmål === s.snitt ? "#f5a623" : "#5577aa",
                            fontSize:11, cursor:"pointer", fontFamily:"Outfit, sans-serif",
                          }}>{s.snitt.toLocaleString("sv-SE")} kr ({s.procent}%)</button>
                        ))}
                      </div>
                      <div style={{ color:"#5577aa", fontSize:11, marginTop:8 }}>Används för streak-räknaren och progress-baren ovan</div>
                    </div>
                  </div>
                )}

                {/* ── BÄSTA DAG ── */}
                {sparkTab === "bästa" && (
                  <div>
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>💰 Bästa lönedagen</div>
                      {bästaLön ? (() => {
                        const lön = calcDayPay(bästaLön.dagTyp, bästaLön.startMin, bästaLön.endMin, settings.timlön);
                        const prov = (bästaLön.tb??0) * ((summary.aktivStege?.procent??0)+(summary.kpiProcent??0))/100;
                        const tot = lön + prov + (bästaLön.bonus??0);
                        return (<>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ fontSize:22 }}>{DAG_META[bästaLön.dagTyp]?.emoji}</span>
                              <div>
                                <div style={{ color:"#fff", fontWeight:600 }}>{DAG_META[bästaLön.dagTyp]?.label}{bästaLön.datum ? ` · ${bästaLön.datum.slice(5).replace("-","/")}` : ""}</div>
                                <div style={{ color:"#5577aa", fontSize:12 }}>{minToHHMM(bästaLön.startMin)} – {minToHHMM(bästaLön.endMin)}</div>
                              </div>
                            </div>
                            <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:24 }}>{fmt(tot)}</div>
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                            {[["Timlön", fmt(lön)], ["Provision", fmt(prov)], ...(bästaLön.bonus > 0 ? [["Bonus", fmt(bästaLön.bonus)]] : [])].map(([l,v]) => (
                              <div key={l} style={{ background:ND, borderRadius:8, padding:"6px 8px" }}>
                                <div style={{ color:"#5577aa", fontSize:9, textTransform:"uppercase", letterSpacing:1 }}>{l}</div>
                                <div style={{ color:"#c8deff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:13 }}>{v}</div>
                              </div>
                            ))}
                          </div>
                        </>);
                      })() : <div style={{ color:"#4466aa", textAlign:"center", padding:"12px 0" }}>Inga pass registrerade</div>}
                    </div>

                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                      <div style={{ color:G, fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>📊 Högst TB</div>
                      {bästaTB ? (
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:20 }}>{DAG_META[bästaTB.dagTyp]?.emoji}</span>
                            <div>
                              <div style={{ color:"#fff", fontWeight:600 }}>{DAG_META[bästaTB.dagTyp]?.label}{bästaTB.datum ? ` · ${bästaTB.datum.slice(5).replace("-","/")}` : ""}</div>
                              <div style={{ color:"#5577aa", fontSize:12 }}>{minToHHMM(bästaTB.startMin)} – {minToHHMM(bästaTB.endMin)}</div>
                            </div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:26 }}>{Math.round(bästaTB.tb??0).toLocaleString("sv-SE")} kr</div>
                            <div style={{ color:"#5577aa", fontSize:11 }}>TB</div>
                          </div>
                        </div>
                      ) : <div style={{ color:"#4466aa", textAlign:"center", padding:"12px 0" }}>Inga säljpass registrerade</div>}
                    </div>

                    {bästaTjänster && (
                      <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px" }}>
                        <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>🎯 Flest tjänster</div>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:20 }}>{DAG_META[bästaTjänster.dagTyp]?.emoji}</span>
                            <div>
                              <div style={{ color:"#fff", fontWeight:600 }}>{DAG_META[bästaTjänster.dagTyp]?.label}{bästaTjänster.datum ? ` · ${bästaTjänster.datum.slice(5).replace("-","/")}` : ""}</div>
                            </div>
                          </div>
                          <div style={{ color:"#f5a623", fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:24 }}>
                            {Object.values(bästaTjänster.tjänster??{}).reduce((s,v)=>s+v,0)} st
                          </div>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                          {Object.entries(bästaTjänster.tjänster??{}).filter(([,v])=>v>0).map(([id,v]) => {
                            const kpi = (mData.kpiMål??[]).find(k=>k.id===id);
                            return kpi ? (
                              <div key={id} style={{ background:ND, borderRadius:8, padding:"5px 10px", display:"flex", gap:6, alignItems:"center" }}>
                                <span style={{ color:"#5577aa", fontSize:12 }}>{kpi.namn}</span>
                                <span style={{ color:"#f5a623", fontFamily:"Rajdhani, sans-serif", fontWeight:700 }}>{v}</span>
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── TEMPO ── */}
                {sparkTab === "tempo" && (() => {
                  const topTier      = [...stege].sort((a,b) => b.snitt - a.snitt)[0] ?? { snitt: 0, procent: 0 };
                  const kpiP         = summary?.kpiProcent ?? 0;
                  const totalProcent = (aktivStege_?.procent ?? 0) + kpiP;
                  const lönPerPass   = calcDayPay(sparkDagTyp, sparkStart, sparkEnd, settings.timlön);
                  const projLön      = days.reduce((s, d) => s + calcDayPay(d.dagTyp, d.startMin, d.endMin, settings.timlön), 0)
                                     + passKvar * lönPerPass;

                  // Specialregel för aktiv period
                  const specialRegel = gnistanPeriod?.specialRegel;
                  const harSpecial   = specialRegel?.aktiv;
                  const specialGräns = harSpecial ? (specialRegel.snittGräns ?? 0) * (curSäljDagar + passKvar) : 0;
                  const maxTBTotal   = harSpecial ? specialGräns : topTier.snitt * (curSäljDagar + passKvar);

                  // Bägare-beräkning
                  // Stegmarkeringar baserat på stege
                  const sortadeStege = [...stege].sort((a,b) => a.snitt - b.snitt).filter(s => s.snitt > 0);
                  const maxSnitt     = harSpecial ? (specialRegel.snittGräns ?? 0) : (topTier.snitt ?? 0);
                  const totalDagar   = curSäljDagar + passKvar;
                  const maxTBMöjligt = maxSnitt * totalDagar;

                  // TB gjort vs kvar
                  const tbGjort  = curTotalTB;
                  const tbKvar   = Math.max(0, maxTBMöjligt - tbGjort);
                  const fyllnad  = maxTBMöjligt > 0 ? Math.min(1, tbGjort / maxTBMöjligt) : 0;
                  const överskott = tbGjort > maxTBMöjligt;

                  // Prov-beräkning
                  const projTB   = curTotalTB + passKvar * curSnitt;
                  const projProv = harSpecial
                    ? (() => {
                        const gräns = (specialRegel.snittGräns ?? 0) * Math.min(curSäljDagar + passKvar, totalDagar);
                        const under = Math.min(projTB, gräns);
                        const över  = Math.max(0, projTB - gräns);
                        const snittOk = (curSäljDagar + passKvar) > 0 && projTB / (curSäljDagar + passKvar) >= (specialRegel.snittGräns ?? 0);
                        return snittOk ? under * (specialRegel.snittProcent ?? 7) / 100 + över * (specialRegel.överskottProcent ?? 10) / 100
                          : projTB * totalProcent / 100;
                      })()
                    : projTB * totalProcent / 100;
                  const projBrutto = projLön + projProv + (summary?.skottTotal ?? 0) + (summary?.bonusTotal ?? 0);
                  const projNetto  = projBrutto * (1 - settings.skatt / 100);

                  const minTBPerPass = curSäljDagar > 0 && passKvar > 0
                    ? Math.max(0, (aktivStege_?.snitt ?? 0) * (curSäljDagar + passKvar) - curTotalTB) / passKvar
                    : 0;
                  const drömVal   = parseFloat(drömSnitt) || 0;
                  const drömTB    = curTotalTB + passKvar * drömVal;
                  const drömTier  = [...stege].reverse().find(s => (drömTB/(curSäljDagar+passKvar||1)) >= s.snitt) ?? stege[0] ?? { procent: 0 };
                  const drömProv  = drömTB * (drömTier.procent + kpiP) / 100;
                  const drömBrutto = projLön + drömProv + (summary?.skottTotal ?? 0) + (summary?.bonusTotal ?? 0);
                  const drömNetto  = drömBrutto * (1 - settings.skatt / 100);
                  const maxProv    = harSpecial
                    ? (() => {
                        const gräns = specialGräns;
                        const under = Math.min(maxTBTotal, gräns);
                        const över  = Math.max(0, maxTBTotal - gräns);
                        return under * (specialRegel.snittProcent ?? 7) / 100 + över * (specialRegel.överskottProcent ?? 10) / 100;
                      })()
                    : maxTBTotal * (topTier.procent + kpiP) / 100;
                  const maxBrutto_ = projLön + maxProv + (summary?.skottTotal ?? 0) + (summary?.bonusTotal ?? 0);
                  const maxNetto_  = maxBrutto_ * (1 - settings.skatt / 100);

                  function ProjCard({ title, emoji, brutto, netto, extra, color }) {
                    return (
                      <div style={{ background: NC, border: `1px solid ${color ?? N}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                        <div style={{ color: color ?? "#5577aa", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
                          {emoji} {title}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: extra ? 8 : 0 }}>
                          <div style={{ background: ND, borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Brutto</div>
                            <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20 }}>{fmt(brutto)}</div>
                          </div>
                          <div style={{ background: `${color ?? G}18`, borderRadius: 10, padding: "10px 12px", border: `1px solid ${color ?? G}44` }}>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Netto</div>
                            <div style={{ color: color ?? G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20 }}>{fmt(netto)}</div>
                          </div>
                        </div>
                        {extra && <div style={{ color: "#5577aa", fontSize: 11, marginTop: 4 }}>{extra}</div>}
                      </div>
                    );
                  }

                  const BÄGARE_H = 280; // px höjd på bägaren

                  return (
                    <div>
                      {/* ── TB STATUS-KORT ── */}
                      <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
                        <div style={{ color: G, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>📊 TB denna period</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          {[
                            ["✅ Gjort", Math.round(tbGjort).toLocaleString("sv-SE") + " kr", G],
                            ["🎯 Behövs för max", Math.round(maxTBMöjligt).toLocaleString("sv-SE") + " kr", "#f5a623"],
                            ["📊 Kvar", Math.round(tbKvar).toLocaleString("sv-SE") + " kr", överskott ? G : "#c8deff"],
                          ].map(([lbl, val, clr]) => (
                            <div key={lbl} style={{ flex: 1, background: ND, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                              <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{lbl}</div>
                              <div style={{ color: clr, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {harSpecial && (
                          <div style={{ background: "#1a1200", border: "1px solid #f5a62344", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: "#f5a623" }}>
                            💎 Specialregel: snitt ≥ {(specialRegel.snittGräns ?? 0).toLocaleString("sv-SE")} kr/dag → {specialRegel.snittProcent ?? 7}% + {specialRegel.överskottProcent ?? 10}% på överskott
                          </div>
                        )}
                      </div>

                      {/* ── VERTIKAL BÄGARE ── */}
                      <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
                        <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>💰 TB-bägaren</div>
                        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

                          {/* Bägaren */}
                          <div style={{ position: "relative", width: 70, flexShrink: 0 }}>
                            {/* Yttre bägare */}
                            <div style={{
                              width: 70, height: BÄGARE_H,
                              background: ND, borderRadius: "8px 8px 16px 16px",
                              border: `2px solid ${N}`,
                              position: "relative", overflow: "hidden",
                            }}>
                              {/* Fyllning — bas (upp till specialgräns eller max) */}
                              <div style={{
                                position: "absolute", bottom: 0, left: 0, right: 0,
                                height: `${Math.min(fyllnad, 1) * 100}%`,
                                background: överskott
                                  ? `linear-gradient(180deg, #f5a623 0%, ${G} 60%)`
                                  : `linear-gradient(180deg, ${G}88 0%, ${G} 100%)`,
                                transition: "height .6s ease",
                              }} />

                              {/* Överskott-zonen (ovanför specialgränsen) — orange */}
                              {harSpecial && tbGjort > maxTBMöjligt && (
                                <div style={{
                                  position: "absolute", bottom: "100%", left: 0, right: 0,
                                  height: `${Math.min((tbGjort - maxTBMöjligt) / maxTBMöjligt * 100, 30)}%`,
                                  background: "linear-gradient(180deg, #ff9900 0%, #f5a623 100%)",
                                  opacity: 0.9,
                                }} />
                              )}

                              {/* Steg-markeringar */}
                              {sortadeStege.map((s, i) => {
                                const yPct = maxSnitt > 0 ? (s.snitt / maxSnitt) * 100 : 0;
                                const isCurrent = s.procent === (aktivStege_?.procent ?? 0);
                                const isNästa = stege.find(st => st.snitt > curSnitt)?.snitt === s.snitt;
                                return (
                                  <div key={i} style={{
                                    position: "absolute",
                                    bottom: `${yPct}%`,
                                    left: 0, right: 0,
                                    borderTop: `2px dashed ${isCurrent ? G : isNästa ? "#f5a623" : "#334"}`,
                                    zIndex: 2,
                                  }} />
                                );
                              })}

                              {/* Specialgräns-linje */}
                              {harSpecial && (
                                <div style={{
                                  position: "absolute", bottom: "100%", left: 0, right: 0,
                                  borderTop: "3px solid #f5a623",
                                  zIndex: 3,
                                  marginBottom: -1,
                                }} />
                              )}

                              {/* Vågrörelse-effekt */}
                              <div style={{
                                position: "absolute",
                                bottom: `${Math.min(fyllnad, 1) * 100}%`,
                                left: -10, right: -10, height: 8,
                                background: "rgba(255,255,255,0.15)",
                                borderRadius: "50%",
                                zIndex: 3,
                              }} />
                            </div>

                            {/* Procent i bägaren */}
                            <div style={{
                              position: "absolute",
                              bottom: `${Math.min(fyllnad * 100 / 2, 45)}%`,
                              left: 0, right: 0, textAlign: "center",
                              color: fyllnad > 0.15 ? "#001435" : "#5577aa",
                              fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 16,
                              zIndex: 4,
                            }}>
                              {Math.round(fyllnad * 100)}%
                            </div>
                          </div>

                          {/* Etiketter till höger */}
                          <div style={{ flex: 1, position: "relative", height: BÄGARE_H }}>
                            {/* Specialgräns-etikett högst upp */}
                            {harSpecial && (
                              <div style={{ position: "absolute", top: -8, left: 0, right: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ width: 12, height: 3, background: "#f5a623", borderRadius: 2 }} />
                                  <div>
                                    <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 700 }}>💎 Max ({specialRegel.snittGräns?.toLocaleString("sv-SE")} kr/dag)</div>
                                    <div style={{ color: "#5577aa", fontSize: 10 }}>{Math.round(maxTBMöjligt).toLocaleString("sv-SE")} kr totalt · {specialRegel.snittProcent ?? 7}%+{specialRegel.överskottProcent ?? 10}%</div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Steg-etiketter */}
                            {[...sortadeStege].reverse().map((s, i) => {
                              const yPct  = maxSnitt > 0 ? (s.snitt / maxSnitt) * 100 : 0;
                              const yPos  = BÄGARE_H - (yPct / 100 * BÄGARE_H);
                              const tbNivå = s.snitt * totalDagar;
                              const isCurrent = s.procent === (aktivStege_?.procent ?? 0);
                              const nådd = curTotalTB >= tbNivå;
                              return (
                                <div key={i} style={{
                                  position: "absolute",
                                  top: yPos - 10,
                                  left: 0, right: 0,
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{ width: 8, height: 2, background: isCurrent ? G : nådd ? `${G}66` : "#334", borderRadius: 1 }} />
                                    <div>
                                      <div style={{ color: isCurrent ? G : nådd ? `${G}99` : "#5577aa", fontSize: 11, fontWeight: isCurrent ? 700 : 400 }}>
                                        {nådd ? "✅" : "○"} {s.procent}% — {s.snitt.toLocaleString("sv-SE")} kr/dag
                                      </div>
                                      <div style={{ color: "#444", fontSize: 10 }}>
                                        {Math.round(tbNivå).toLocaleString("sv-SE")} kr totalt
                                        {!nådd && <span style={{ color: "#f5a62399" }}> · kvar: {Math.round(Math.max(0, tbNivå - curTotalTB)).toLocaleString("sv-SE")} kr</span>}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* Din position */}
                            {maxTBMöjligt > 0 && (
                              <div style={{
                                position: "absolute",
                                top: BÄGARE_H - (fyllnad * BÄGARE_H) - 14,
                                left: 0, right: 0,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: G, border: "2px solid #fff", flexShrink: 0 }} />
                                  <div style={{ background: `${G}22`, border: `1px solid ${G}`, borderRadius: 6, padding: "2px 8px" }}>
                                    <div style={{ color: G, fontSize: 11, fontWeight: 700 }}>Du: {Math.round(curTotalTB).toLocaleString("sv-SE")} kr</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Nuläge-rad */}
                      <div style={{ background: ND, borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        {[
                          ["Snitt nu", `${Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag`],
                          ["Serie", `${totalProcent}%`],
                          ["Pass kvar", `${passKvar} st`],
                        ].map(([l,v]) => (
                          <div key={l}>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{l}</div>
                            <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      <ProjCard
                        title={`Håller du ${Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag`}
                        emoji="📈"
                        brutto={projBrutto}
                        netto={projNetto}
                        extra={`Proj. total TB: ${Math.round(projTB).toLocaleString("sv-SE")} kr · ${curSäljDagar + passKvar} säljdagar`}
                        color={G}
                      />

                      <div style={{ background: NC, border: `1px solid #f5a62344`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                        <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                          ⚠️ Minimum för att hålla {aktivStege_?.procent}%-serien
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ color: "#5577aa", fontSize: 11 }}>Per resterande pass</div>
                            <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 28 }}>
                              {Math.round(minTBPerPass).toLocaleString("sv-SE")} kr
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ color: "#5577aa", fontSize: 11 }}>Nuvarande snitt</div>
                            <div style={{ color: curSnitt >= (aktivStege_?.snitt ?? 0) ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>
                              {Math.round(curSnitt).toLocaleString("sv-SE")} kr
                            </div>
                          </div>
                        </div>
                        {minTBPerPass === 0 && passKvar > 0 && (
                          <div style={{ color: G, fontSize: 12, marginTop: 6 }}>✅ Du är säkrad på denna serie oavsett resterande pass!</div>
                        )}
                      </div>

                      <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                        <div style={{ color: "#c8deff", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                          🚀 Kör hårt — vad händer om du gör...
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: drömVal > 0 ? 12 : 0 }}>
                          <input type="number" value={drömSnitt} step={1000} min={0} placeholder="TB per pass..."
                            onChange={e => setDrömSnitt(e.target.value)}
                            style={{ flex: 1, background: ND, border: `1px solid ${N}`, color: "#c8deff", borderRadius: 10, padding: "10px 14px", fontSize: 18, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                          />
                          <span style={{ color: "#5577aa", fontSize: 13 }}>kr/pass</span>
                        </div>
                        {drömVal > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <div style={{ background: ND, borderRadius: 10, padding: "10px 12px" }}>
                              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Brutto</div>
                              <div style={{ color: "#c8deff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20 }}>{fmt(drömBrutto)}</div>
                            </div>
                            <div style={{ background: `${G}18`, borderRadius: 10, padding: "10px 12px", border: `1px solid ${GD}44` }}>
                              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Netto</div>
                              <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20 }}>{fmt(drömNetto)}</div>
                            </div>
                            <div style={{ gridColumn: "span 2", background: ND, borderRadius: 8, padding: "6px 10px", display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "#5577aa", fontSize: 12 }}>Serie</span>
                              <span style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}>{drömTier.procent + kpiP}%</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <ProjCard
                        title={harSpecial ? `Max (${(specialRegel?.snittGräns ?? 0).toLocaleString("sv-SE")} kr/dag snitt)` : `Månadsmax (${topTier.snitt.toLocaleString("sv-SE")} kr/pass)`}
                        emoji="👑"
                        brutto={maxBrutto_}
                        netto={maxNetto_}
                        extra={harSpecial
                          ? `${specialRegel?.snittProcent ?? 7}% upp till gränsen + ${specialRegel?.överskottProcent ?? 10}% på överskott`
                          : `${topTier.procent + kpiP}% provision · TB ${Math.round(maxTBTotal).toLocaleString("sv-SE")} kr`}
                        color="#f5a623"
                      />
                    </div>
                  );
                })()}

                {/* ── STATS ── */}
                {sparkTab === "stats" && (
                  <div>
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>🏆 Bästa passet denna månad</div>
                      {bestPass ? (<>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                          <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
                            <span style={{ fontSize:20 }}>{DAG_META[bestPass.dagTyp]?.emoji}</span>
                            <div>
                              <div style={{ color:"#fff", fontWeight:600, fontSize:15 }}>{DAG_META[bestPass.dagTyp]?.label}</div>
                              <div style={{ color:"#5577aa", fontSize:12 }}>{minToHHMM(bestPass.startMin)} – {minToHHMM(bestPass.endMin)}</div>
                            </div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:24 }}>{Math.round(bestPass.tb ?? 0).toLocaleString("sv-SE")} kr</div>
                            <div style={{ color:"#5577aa", fontSize:11 }}>TB</div>
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:8 }}>
                          <div style={{ flex:1, background:ND, borderRadius:8, padding:"8px 12px" }}>
                            <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:2 }}>Timlön</div>
                            <div style={{ color:"#c8deff", fontFamily:"Rajdhani, sans-serif", fontWeight:700 }}>{fmt(calcDayPay(bestPass.dagTyp, bestPass.startMin, bestPass.endMin, settings.timlön))}</div>
                          </div>
                          <div style={{ flex:1, background:ND, borderRadius:8, padding:"8px 12px" }}>
                            <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1, marginBottom:2 }}>Bidrag till provision</div>
                            <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:700 }}>{fmt((bestPass.tb ?? 0) * ((summary.aktivStege?.procent ?? 0) + (summary.kpiProcent ?? 0)) / 100)}</div>
                          </div>
                        </div>
                      </>) : (
                        <div style={{ color:"#4466aa", textAlign:"center", padding:"20px 0" }}>Inga säljpass registrerade ännu</div>
                      )}
                    </div>

                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>🔥 Streak — dagsmål {dagsmål.toLocaleString("sv-SE")} kr TB</div>
                      <div style={{ textAlign:"center", marginBottom:14 }}>
                        <div style={{ color: streak > 0 ? "#f5a623" : "#334", fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:64, lineHeight:1 }}>{streak}</div>
                        <div style={{ color:"#5577aa", fontSize:13, marginTop:4 }}>pass i rad över målet</div>
                      </div>
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {säljDays.map((d, i) => {
                          const hit = (d.tb ?? 0) >= dagsmål;
                          return (
                            <div key={i} style={{ width:28, height:28, borderRadius:6, background: hit ? "#f5a623" : ND, border:`1px solid ${hit ? "#f5a623" : "#334"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>
                              {hit ? "✓" : "·"}
                            </div>
                          );
                        })}
                      </div>
                      {säljDays.length > 0 && (
                        <div style={{ color:"#5577aa", fontSize:12, marginTop:10 }}>{passedGoal} av {säljDays.length} pass har nått målet denna månad</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── FAKTA ── */}
                {sparkTab === "fakta" && (() => {
                  const totTimmar = days.reduce((s, d) => {
                    const brk = getBreakMin(d.dagTyp);
                    return s + ((d.endMin - d.startMin) - brk) / 60;
                  }, 0);
                  const månBrutto     = summary?.brutto ?? 0;
                  const månNetto      = summary?.netto ?? 0;
                  const krPerTimBrutto = totTimmar > 0 ? månBrutto / totTimmar : 0;
                  const krPerTimNetto  = totTimmar > 0 ? månNetto / totTimmar : 0;
                  const krPerMinNetto_ = krPerTimNetto / 60;

                  return (
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px" }}>
                      <div style={{ color:G, fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:4 }}>🧠 Snabbfakta</div>
                      <div style={{ color:"#5577aa", fontSize:11, marginBottom:12 }}>Baserat på månadsdata ink. provision</div>
                      {[
                        ["Totalt jobbade timmar", `${totTimmar.toFixed(1)} h`],
                        ["Per timme (brutto)", fmt(krPerTimBrutto)],
                        ["Per timme (netto)", fmt(krPerTimNetto)],
                        ["Per minut (netto)", `${krPerMinNetto_.toFixed(2)} kr`],
                        ["En kaffe (32 kr)", krPerMinNetto_ > 0 ? `${Math.ceil(32/krPerMinNetto_)} min jobb` : "—"],
                        ["En lunch (120 kr)", krPerMinNetto_ > 0 ? `${Math.ceil(120/krPerMinNetto_)} min jobb` : "—"],
                        ["Genomsnitt per pass", days.length > 0 ? fmt(månBrutto / days.length) : "—"],
                      ].map(([label, val], i, arr) => (
                        <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom: i < arr.length-1 ? `1px solid ${N}` : "none" }}>
                          <span style={{ color:"#5577aa", fontSize:13 }}>{label}</span>
                          <span style={{ color:"#c8deff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:14 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ════════════════ HISTORIK ════════════════ */}
          {tab === "historik" && (<>
            <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              Senaste 6 månader
            </div>
            {historyMonths.length === 0 && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px", color: "#4466aa" }}>
                Inga månader registrerade än
              </div>
            )}
            {[...historyMonths].reverse().map(h => (
              <div key={h.key} style={{
                ...cardStyle, marginBottom: 10,
                opacity: h.key === month ? 1 : 0.75,
                border: h.key === month ? `1px solid ${G}` : `1px solid ${N}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 15, textTransform: "capitalize" }}>
                      {fmtMonth(h.key)} {h.key === month && <span style={{ color: G, fontSize: 11 }}>← aktuell</span>}
                    </div>
                    <div style={{ color: "#5577aa", fontSize: 12, marginTop: 2 }}>{h.dagar} pass</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontFamily: "Rajdhani, sans-serif", fontSize: 18 }}>{fmt(h.netto)}</div>
                    <div style={{ color: "#5577aa", fontSize: 11 }}>brutto {fmt(h.brutto)}</div>
                  </div>
                </div>
                <div style={{ height: 6, background: N, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    background: h.key === month ? G : "#3355aa",
                    width: `${Math.max(2, (h.brutto / maxBrutto) * 100)}%`,
                    transition: "width .4s ease",
                  }} />
                </div>
              </div>
            ))}
          </>)}

          {/* ════════════════ INSTÄLLNINGAR ════════════════ */}
          {tab === "inst" && (
            <SettingsPanel settings={settings} setSettings={setSettings} onRunOnboarding={() => setShowOnboarding(true)} />
          )}
        </div>
      </div>

      {showOnboarding && (
        <OnboardingModal
          initialSettings={settings}
          onDone={(newSettings) => {
            setSettings(newSettings);
            try { localStorage.setItem(STOR_OB, "1"); } catch {}
            setShowOnboarding(false);
          }}
        />
      )}

      {dagsmålPopup && (
        <div style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", zIndex: 200 }}>
          <div style={{ width: "100%", background: "#001a50", borderRadius: "24px 24px 0 0", padding: "24px 18px 40px", animation: "slideUp .25s ease" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 10 }}>🎯</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 20, textAlign: "center", marginBottom: 6 }}>Sätt ditt dagsmål</div>
            <div style={{ color: "#5577aa", fontSize: 13, textAlign: "center", marginBottom: 20 }}>
              Högsta stegen är {dagsmålPopup.förslag.toLocaleString("sv-SE")} kr/dag — sätt ditt mål!
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {/* Snabbval */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[dagsmålPopup.förslag, Math.round(dagsmålPopup.förslag * 0.8 / 1000) * 1000, Math.round(dagsmålPopup.förslag * 1.2 / 1000) * 1000]
                  .filter((v,i,a) => v > 0 && a.indexOf(v) === i)
                  .sort((a,b) => a-b)
                  .map(v => (
                    <button key={v} onClick={() => setDagsmålPopup(p => ({ ...p, valt: v }))} style={{
                      flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                      background: dagsmålPopup.valt === v ? G : NC,
                      border: `1px solid ${dagsmålPopup.valt === v ? G : N}`,
                      color: dagsmålPopup.valt === v ? "#001435" : "#fff",
                      fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16,
                    }}>{v.toLocaleString("sv-SE")} kr</button>
                  ))
                }
              </div>
              {/* Eget värde */}
              <input
                type="number" step={1000} min={0}
                value={dagsmålPopup.valt ?? dagsmålPopup.förslag}
                onChange={e => setDagsmålPopup(p => ({ ...p, valt: parseFloat(e.target.value) || 0 }))}
                style={{ width: "100%", background: ND, border: `1px solid #f5a62355`, color: "#f5a623", borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDagsmålPopup(null)} style={{
                flex: 1, padding: 14, background: "transparent", border: `1px solid ${N}`,
                borderRadius: 14, color: "#5577aa", fontWeight: 600, fontSize: 15,
                cursor: "pointer", fontFamily: "Outfit, sans-serif",
              }}>Hoppa över</button>
              <button onClick={() => {
                const val = dagsmålPopup.valt ?? dagsmålPopup.förslag;
                setDagsmål(val);
                setDagsmålPopup(null);
              }} style={{
                flex: 2, padding: 14, background: G, border: "none",
                borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 15,
                cursor: "pointer", fontFamily: "Outfit, sans-serif",
              }}>✅ Sätt dagsmål</button>
            </div>
          </div>
        </div>
      )}

      {celebration && (
        <CelebrationModal
          celebration={celebration}
          summary={summary}
          settings={settings}
          monthStege={monthStege}
          onClose={() => setCelebration(null)}
        />
      )}

      {kodModalOpen && (
        <KodModal
          onApply={(stege, kpiMål, bonusAktiv) => {
            saveMonthStege(stege);
            saveMonthKPI(kpiMål);
            mutateMonth(cur => ({ ...cur, bonusAktiv }));
            setKodModalOpen(false);
          }}
          onClose={() => setKodModalOpen(false)}
        />
      )}

      {planeraOpen && (
        <PlaneraModal
          initialPlan={Array.isArray(mData.planerade) ? mData.planerade : []}
          month={month}
          settings={settings}
          onSave={p => { savePlanerade(p); setPlaneraOpen(false); }}
          onCancel={() => setPlaneraOpen(false)}
        />
      )}

      {stegeOpen && (
        <StegeModal
          initialStege={mData.tbStege ?? settings.tbStege ?? []}
          initialKPI={mData.kpiMål ?? []}
          initialBonus={mData.bonusAktiv ?? false}
          initialPerioder={mData.perioder ?? null}
          month={month}
          onSave={(stege, kpiMål, bonusAktiv, specialRegel) => {
            saveMonthStege(stege);
            saveMonthKPI(kpiMål);
            mutateMonth(cur => ({ ...cur, bonusAktiv, specialRegel }));
            setStegeOpen(false);
            // Föreslå dagsmål baserat på högsta stegen
            const högsta = [...stege].sort((a,b) => b.snitt - a.snitt)[0];
            if (högsta?.snitt > 0) setDagsmålPopup({ förslag: högsta.snitt });
          }}
          onSavePerioder={(nyaPerioder) => {
            saveMonthPerioder(nyaPerioder);
            setStegeOpen(false);
            // Föreslå dagsmål baserat på högsta stegen över alla perioder
            const allaStege = nyaPerioder.flatMap(p => p.tbStege ?? []);
            const högsta = [...allaStege].sort((a,b) => b.snitt - a.snitt)[0];
            if (högsta?.snitt > 0) setDagsmålPopup({ förslag: högsta.snitt });
          }}
          onCancel={() => setStegeOpen(false)}
        />
      )}

      {addOpen && (
        <DayForm
          settings={settings}
          kpiMål={(() => {
            // Slå ihop mData.kpiMål (gamla id:n) och period-KPI
            // mData.kpiMål prioriteras för att matcha sparade tjänster-id:n
            const månadsKPI = mData.kpiMål ?? [];
            if (perioder) {
              const editDatum = editId ? days.find(d => d.id === editId)?.datum : null;
              const p = editDatum
                ? perioder.find(p => editDatum >= p.startDatum && editDatum <= p.slutDatum)
                : null;
              const periodKPI = p?.kpiMål ?? [];
              // Använd månadsKPI om den finns, annars period-KPI
              // Slå ihop: månadsKPI + period-KPI som inte redan finns (baserat på namn)
              const merged = [...månadsKPI];
              periodKPI.forEach(pk => {
                if (!merged.some(m => m.id === pk.id || m.namn === pk.namn)) {
                  merged.push(pk);
                }
              });
              return merged;
            }
            return månadsKPI;
          })()}
          bonusAktiv={mData.bonusAktiv ?? false}
          getPeriodBonusAktiv={(d) => {
            try {
              if (perioder && d) {
                const p = perioder.find(p => d >= p.startDatum && d <= p.slutDatum);
                if (p) return p.bonusAktiv ?? false;
              }
              return mData.bonusAktiv ?? false;
            } catch { return mData.bonusAktiv ?? false; }
          }}
          initialDay={editId ? days.find(d => d.id === editId) : null}
          onSave={day => {
            saveDay(day);
            setAddOpen(false);
            setEditId(null);
            const now = new Date();
            const aktiveraFirande = now.getFullYear() === 2026 && now.getMonth() >= 5 && now.getMonth() <= 7;
            const topSnitt = monthStege.length > 0 ? Math.max(...monthStege.map(s => s.snitt)) : 0;
            const tb = day.tb ?? 0;
            if (aktiveraFirande && topSnitt > 0 && day.passTyp === "sälj") {
              const nivå = tb >= topSnitt * 2 ? 3 : tb >= topSnitt ? 2 : 1;
              setCelebration({ nivå, day, topSnitt });
            }
          }}
          onSaveMonth={data => {
            mutateMonth(cur => ({
              ...cur,
              manualTB: {
                totalTB:   data.totalTB,
                säljDagar: data.säljDagar,
                skott:     data.skott,
              },
              manualDagar: {
                vardagar: data.vardagar, lördagar: data.lördagar,
                söndagar: data.söndagar, röda: data.röda,
                kassaDagar: data.kassaDagar,
              },
            }));
            setAddOpen(false);
          }}
          onSaveDefault={(typ, start, end, prov) => {
            setSettings(p => ({
              ...p,
              defaults: { ...p.defaults, [typ]: { start, end, prov } }
            }));
          }}
          onCancel={() => { setAddOpen(false); setEditId(null); }}
        />
      )}
    </>
  );
}

// ─── Provisions-kod encode/decode ─────────────────────────────────────────
function encodeProvision(stege, kpiMål, bonusAktiv) {
  const data = { s: stege.map(s => [s.snitt, s.procent]), k: kpiMål.map(k => [k.id, k.namn, k.mål, k.procent, k.aktiv !== false ? 1 : 0]), b: bonusAktiv ? 1 : 0 };
  try { return "LK-" + btoa(unescape(encodeURIComponent(JSON.stringify(data)))); }
  catch { return ""; }
}

function encodeMånad(läge, stege, kpiMål, bonusAktiv, enkelSpecial, perioder) {
  try {
    const data = {
      v: 2, // version
      l: läge === "perioder" ? "p" : "e",
      // Enkel-läge
      s: stege.map(s => [s.snitt, s.procent]),
      k: kpiMål.map(k => [k.id, k.namn, k.mål, k.procent, k.aktiv !== false ? 1 : 0]),
      b: bonusAktiv ? 1 : 0,
      sr: enkelSpecial ? [enkelSpecial.aktiv ? 1 : 0, enkelSpecial.snittGräns ?? 15000, enkelSpecial.snittProcent ?? 7, enkelSpecial.överskottProcent ?? 10] : null,
      // Period-läge
      p: (perioder ?? []).map(p => ({
        id: p.id, n: p.namn,
        sd: p.startDatum, ed: p.slutDatum,
        s: (p.tbStege ?? []).map(s => [s.snitt, s.procent]),
        k: (p.kpiMål ?? []).map(k => [k.id, k.namn, k.mål, k.procent, k.aktiv !== false ? 1 : 0]),
        b: p.bonusAktiv ? 1 : 0,
        sr: p.specialRegel ? [p.specialRegel.aktiv ? 1 : 0, p.specialRegel.snittGräns ?? 15000, p.specialRegel.snittProcent ?? 7, p.specialRegel.överskottProcent ?? 10] : null,
      })),
    };
    return "LK2-" + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  } catch { return ""; }
}

function decodeMånad(kod) {
  try {
    // Nytt format LK2-
    if (kod.startsWith("LK2-")) {
      const data = JSON.parse(decodeURIComponent(escape(atob(kod.slice(4)))));
      const läge = data.l === "p" ? "perioder" : "enkel";
      const stege = (data.s ?? []).map(([snitt, procent]) => ({ snitt, procent }));
      const kpiMål = (data.k ?? []).map(([id, namn, mål, procent, aktiv]) => ({ id, namn, mål, procent, aktiv: aktiv === 1 }));
      const bonusAktiv = data.b === 1;
      const enkelSpecial = data.sr ? { aktiv: data.sr[0] === 1, snittGräns: data.sr[1], snittProcent: data.sr[2], överskottProcent: data.sr[3] } : null;
      const perioder = (data.p ?? []).map(p => ({
        id: p.id, namn: p.n,
        startDatum: p.sd, slutDatum: p.ed,
        tbStege: (p.s ?? []).map(([snitt, procent]) => ({ snitt, procent })),
        kpiMål: (p.k ?? []).map(([id, namn, mål, procent, aktiv]) => ({ id, namn, mål, procent, aktiv: aktiv === 1 })),
        bonusAktiv: p.b === 1,
        specialRegel: p.sr ? { aktiv: p.sr[0] === 1, snittGräns: p.sr[1], snittProcent: p.sr[2], överskottProcent: p.sr[3] } : { aktiv: false, snittGräns: 15000, snittProcent: 7, överskottProcent: 10 },
      }));
      return { läge, stege, kpiMål, bonusAktiv, enkelSpecial, perioder };
    }
    // Gammalt format LK-
    if (kod.startsWith("LK-")) {
      const data = JSON.parse(decodeURIComponent(escape(atob(kod.slice(3)))));
      const stege = (data.s ?? []).map(([snitt, procent]) => ({ snitt, procent }));
      const kpiMål = (data.k ?? []).map(([id, namn, mål, procent, aktiv]) => ({ id, namn, mål, procent, aktiv: aktiv === 1 }));
      return { läge: "enkel", stege, kpiMål, bonusAktiv: data.b === 1, enkelSpecial: null, perioder: [] };
    }
    return null;
  } catch { return null; }
}

function decodeProvision(kod) {
  try {
    if (!kod.startsWith("LK-")) return null;
    const data = JSON.parse(decodeURIComponent(escape(atob(kod.slice(3)))));
    const stege = (data.s ?? []).map(([snitt, procent]) => ({ snitt, procent }));
    const kpiMål = (data.k ?? []).map(([id, namn, mål, procent, aktiv]) => ({ id, namn, mål, procent, aktiv: aktiv === 1 }));
    const bonusAktiv = data.b === 1;
    return { stege, kpiMål, bonusAktiv };
  } catch { return null; }
}

// ─── Celebration Modal ────────────────────────────────────────────────────
function CelebrationModal({ celebration, summary, settings, monthStege, onClose }) {
  const { nivå, day, topSnitt } = celebration;
  const [phase, setPhase] = useState("boom");
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (phase === "boom") {
      const t = setTimeout(() => setPhase(nivå === 3 ? "image" : "summary"), 700);
      return () => clearTimeout(t);
    }
    if (phase === "image") {
      const t = setTimeout(() => setPhase("summary"), 2500);
      return () => clearTimeout(t);
    }
  }, [phase, nivå]);

  useEffect(() => {
    if (phase === "summary") {
      const id = setInterval(() => setFrame(f => f + 1), 80);
      return () => clearInterval(id);
    }
  }, [phase]);

  // Hitta rätt period för detta pass
  const aktivPeriod = summary.periodSummaries
    ? summary.periodSummaries.find(p => day.datum && day.datum >= p.startDatum && day.datum <= p.slutDatum)
    : null;

  // Beräkna TB-provision för detta pass med rätt modell
  const dayTB = day.tb ?? 0;
  let tbProv = 0;
  if (aktivPeriod) {
    const pSR = aktivPeriod.specialRegel;
    const pSäljDagar = aktivPeriod.säljDagar;
    const pTotalTB   = aktivPeriod.totalTB;
    const pSnitt     = pSäljDagar > 0 ? pTotalTB / pSäljDagar : 0;
    if (pSR?.aktiv && pSnitt >= (pSR.snittGräns ?? 0)) {
      const tbGräns = (pSR.snittGräns ?? 0) * pSäljDagar;
      const tbUnder = Math.min(pTotalTB, tbGräns);
      const tbÖver  = Math.max(0, pTotalTB - tbGräns);
      tbProv = tbUnder * (pSR.snittProcent ?? 7) / 100 + tbÖver * (pSR.överskottProcent ?? 10) / 100;
      // Visa provisionsbidrag för just detta pass
      const dagTbGräns = (pSR.snittGräns ?? 0);
      const dagUnder = Math.min(dayTB, dagTbGräns);
      const dagÖver  = Math.max(0, dayTB - dagTbGräns);
      tbProv = dagUnder * (pSR.snittProcent ?? 7) / 100 + dagÖver * (pSR.överskottProcent ?? 10) / 100;
    } else {
      tbProv = dayTB * ((aktivPeriod.aktivStege?.procent ?? 0) + (aktivPeriod.kpiProcent ?? 0)) / 100;
    }
  } else {
    tbProv = dayTB * ((summary.aktivStege?.procent ?? 0) + (summary.kpiProcent ?? 0)) / 100;
  }

  const bonus = day.bonus ?? 0;

  // TB tillgodo — använd rätt period
  const tillgodoPeriod = aktivPeriod ?? summary;
  const tillgodoSnitt  = aktivPeriod ? (aktivPeriod.aktivStege?.snitt ?? 0) : (summary.aktivStege?.snitt ?? 0);
  const tillgodoDagar  = aktivPeriod ? aktivPeriod.säljDagar : summary.säljDagar;
  const tillgodoTB     = aktivPeriod ? aktivPeriod.totalTB : summary.totalTB;
  const tillgodo       = Math.round(tillgodoTB - tillgodoSnitt * tillgodoDagar);
  const överskott      = tillgodo >= 0;

  const emojiSet = nivå === 3
    ? ["🍺","🌈","⚡","💥","🎆","🏆","👑","💰","🔥","🎊","💸","✨","🎉","🌟","💫"]
    : ["🔥","💸","⚡","🏆","💰","🎊","✨","💥","🌟","🎉"];

  const particles = phase === "summary" ? Array.from({ length: 14 }, (_, i) => ({
    emoji: emojiSet[i % emojiSet.length],
    x: Math.sin(i * 137.5 + frame * 0.4) * 48 + 50,
    y: ((frame * 3 + i * 25) % 130) - 15,
    size: 14 + (i % 4) * 6,
  })) : [];

  if (phase === "boom") return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: nivå === 3 ? "#f5a623" : G,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <style>{`
        @keyframes boomIn { 0%{opacity:0;transform:scale(0.3)} 40%{opacity:1;transform:scale(1.15)} 70%{transform:scale(0.95)} 100%{transform:scale(1)} }
        @keyframes danielIn { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes summaryUp { from{transform:translateY(60px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
      <div style={{ textAlign: "center", animation: "boomIn 0.6s ease" }}>
        <div style={{ fontSize: 90 }}>{nivå === 3 ? "🍺" : "🔥"}</div>
        <div style={{ color: "#001435", fontFamily: "Rajdhani, sans-serif", fontWeight: 900, fontSize: 52, letterSpacing: 4 }}>
          {nivå === 3 ? "BOOM!" : "YES!"}
        </div>
      </div>
    </div>
  );

  if (phase === "image") return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000" }}
      onClick={() => setPhase("summary")}>
      <img src="/daniel.png" alt="" style={{
        width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center",
        animation: "danielIn 0.5s ease",
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "linear-gradient(transparent, rgba(0,10,30,0.95))",
        padding: "60px 20px 40px", textAlign: "center",
      }}>
        <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 900, fontSize: 38, letterSpacing: 3, textShadow: "0 0 20px #f5a62366" }}>
          OKTOBERFEST-NIVÅ!
        </div>
        <div style={{ color: "#fff", fontSize: 14, marginTop: 6, opacity: 0.7 }}>Tryck för sammanfattning</div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)" }} />
      {particles.map((p, i) => (
        <div key={i} style={{
          position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
          fontSize: p.size, pointerEvents: "none", zIndex: 201,
        }}>{p.emoji}</div>
      ))}
      <div style={{
        position: "relative", width: "100%", zIndex: 203,
        background: "#001435", borderRadius: "24px 24px 0 0",
        borderTop: `3px solid ${nivå === 3 ? "#f5a623" : nivå === 2 ? G : "#5577aa"}`,
        padding: "20px 18px 40px",
        animation: "summaryUp 0.4s ease",
        maxHeight: "80vh", overflowY: "auto",
      }}>
        {nivå === 3 ? (<>
          <div style={{ fontSize: 30, textAlign: "center", marginBottom: 6 }}>🍺👑🍺</div>
          <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 26, textAlign: "center", marginBottom: 4 }}>OKTOBERFEST-NIVÅ!</div>
          <div style={{ color: "#fff", fontSize: 13, textAlign: "center", marginBottom: 16 }}>Dubbla budgeten! Daniel hade velat se det här! 🔥</div>
        </>) : nivå === 2 ? (<>
          <div style={{ fontSize: 28, textAlign: "center", marginBottom: 6 }}>🔥🏆🔥</div>
          <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 24, textAlign: "center", marginBottom: 4 }}>SUPERPASS!</div>
          <div style={{ color: "#fff", fontSize: 13, textAlign: "center", marginBottom: 16 }}>Över budgeten — det är så det ska se ut!</div>
        </>) : (<>
          <div style={{ fontSize: 24, textAlign: "center", marginBottom: 6 }}>💪</div>
          <div style={{ color: "#5577aa", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20, textAlign: "center", marginBottom: 4 }}>Du är fortfarande med i matchen!</div>
          <div style={{ color: "#5577aa", fontSize: 12, textAlign: "center", marginBottom: 16 }}>
            {topSnitt > 0 ? `${(topSnitt - (day.tb ?? 0)).toLocaleString("sv-SE")} kr under budgeten idag` : ""}
          </div>
        </>)}

        <div style={{ background: ND, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Passets sammanfattning</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              ["Timlön ink OB", fmt(calcDayPay(day.dagTyp, day.startMin, day.endMin, settings.timlön))],
              ["TB-provision", fmt(tbProv)],
              ...(bonus > 0 ? [["🏆 Tävlingsbonus", fmt(bonus)]] : []),
              ["Totalt brutto", fmt(calcDayPay(day.dagTyp, day.startMin, day.endMin, settings.timlön) + tbProv + bonus)],
            ].map(([label, val]) => (
              <div key={label} style={{ background: NC, borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{label}</div>
                <div style={{ color: label === "Totalt brutto" ? G : "#c8deff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: överskott ? `${G}15` : "#1a0000",
          border: `1px solid ${överskott ? GD : "#aa2222"}`,
          borderRadius: 10, padding: "10px 14px", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ color: "#5577aa", fontSize: 11 }}>TB tillgodo på guldnivån</div>
          <div style={{ color: överskott ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>
            {överskott ? "+" : ""}{tillgodo.toLocaleString("sv-SE")} kr
          </div>
        </div>

        <button onClick={onClose} style={{
          width: "100%", padding: 14, background: nivå === 3 ? "#f5a623" : G,
          border: "none", borderRadius: 14, color: "#001435",
          fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "Outfit, sans-serif",
        }}>
          {nivå === 3 ? "🍺 SKÅL!" : nivå === 2 ? "🔥 Fortsätt så!" : "💪 Nästa pass blir bättre!"}
        </button>
      </div>
    </div>
  );
}

// ─── Kod-modal ────────────────────────────────────────────────────────────
function KodModal({ onApply, onClose }) {
  const [kod, setKod] = useState("");
  const [fel, setFel] = useState("");
  const [preview, setPreview] = useState(null);

  function handleKod(val) {
    setKod(val);
    setFel("");
    if (val.length > 10) {
      const result = decodeProvision(val);
      setPreview(result);
      if (!result) setFel("Ogiltig kod — kontrollera att du kopierat hela koden");
    } else {
      setPreview(null);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
      <div style={{ width: "100%", background: "#001a50", borderRadius: "24px 24px 0 0", padding: "20px 18px 40px", animation: "slideUp .25s ease", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>📥 Ange delningskod</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#5577aa", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 16 }}>Klistra in koden från din chef eller kollega</div>

        <textarea
          value={kod}
          onChange={e => handleKod(e.target.value)}
          placeholder="Klistra in kod här..."
          rows={3}
          style={{
            width: "100%", background: ND, border: `1px solid ${fel ? "#aa2222" : N}`,
            color: "#fff", borderRadius: 10, padding: "12px 14px",
            fontSize: 13, fontFamily: "monospace", resize: "none", marginBottom: 8,
          }}
        />

        {fel && <div style={{ color: "#ff6666", fontSize: 12, marginBottom: 12 }}>{fel}</div>}

        {preview && (<>
          <div style={{ background: `${G}15`, border: `1px solid ${GD}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ color: G, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>✅ Förhandsgranskning</div>
            {preview.stege.map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${N}` }}>
                <span style={{ color: "#5577aa", fontSize: 13 }}>Steg {i+1}: {s.snitt.toLocaleString("sv-SE")} kr/dag</span>
                <span style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}>{s.procent}%</span>
              </div>
            ))}
            {preview.kpiMål.map(k => (
              <div key={k.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${N}` }}>
                <span style={{ color: "#5577aa", fontSize: 13 }}>KPI: {k.namn} ({k.mål} st/dag)</span>
                <span style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}>+{k.procent}%</span>
              </div>
            ))}
            {preview.bonusAktiv && <div style={{ color: "#f5a623", fontSize: 12, marginTop: 6 }}>🏆 Tävlingsbonus aktiv</div>}
          </div>
          <button onClick={() => onApply(preview.stege, preview.kpiMål, preview.bonusAktiv)} style={{
            width: "100%", padding: 16, background: G, border: "none",
            borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
            cursor: "pointer", fontFamily: "Outfit, sans-serif",
          }}>Använd denna provision</button>
        </>)}
      </div>
    </div>
  );
}

// ─── Planera-modal (kalender) ────────────────────────────────────────────
function PlaneraModal({ initialPlan, month, settings, onSave, onCancel }) {
  const initArray = Array.isArray(initialPlan) ? initialPlan : [];
  const [plan, setPlan]         = useState(initArray);
  const [editDay, setEditDay]   = useState(null);
  const [holdTimer, setHoldTimer] = useState(null);

  const [year, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mo, 0).getDate();
  const firstDow    = new Date(year, mo - 1, 1).getDay();
  const startOffset = (firstDow + 6) % 7;

  function dateStr(day) {
    return `${year}-${String(mo).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }

  function getPlanDay(datum) { return plan.find(p => p.datum === datum); }

  function toggleDay(datum) {
    const dagTyp = getDagTypFromDate(datum);
    const def    = settings.defaults?.[dagTyp] ?? {};
    if (getPlanDay(datum)) {
      setPlan(p => p.filter(x => x.datum !== datum));
    } else {
      setPlan(p => [...p, { datum, dagTyp, startMin: def.start ?? 9*60+45, endMin: def.end ?? 17*60 }]);
    }
  }

  function startHold(datum) {
    const t = setTimeout(() => {
      const pd = getPlanDay(datum);
      if (pd) setEditDay({ ...pd });
    }, 500);
    setHoldTimer(t);
  }

  function endHold() {
    if (holdTimer) { clearTimeout(holdTimer); setHoldTimer(null); }
  }

  function saveEditDay(d) {
    setPlan(p => p.map(x => x.datum === d.datum ? d : x));
    setEditDay(null);
  }

  const dagFärg = { vardag: "#5bc500", lördag: "#f5a623", söndag: "#e05c5c", röd: "#e05c5c" };
  const totalt  = plan.length;
  const veckodag = ["Mån","Tis","Ons","Tor","Fre","Lör","Sön"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
      <div style={{ width: "100%", background: "#001a50", borderRadius: "24px 24px 0 0", padding: "20px 18px 40px", animation: "slideUp .25s ease", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Planera månaden</div>
            <div style={{ color: "#5577aa", fontSize: 12, marginTop: 2 }}>Tryck = markera · Håll in = justera tider</div>
          </div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: "#5577aa", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {veckodag.map(d => (
            <div key={d} style={{ color: d === "Lör" ? "#f5a623" : d === "Sön" ? "#e05c5c" : "#5577aa", fontSize: 10, textAlign: "center", fontWeight: 600 }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 16 }}>
          {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d      = i + 1;
            const datum  = dateStr(d);
            const dagTyp = getDagTypFromDate(datum);
            const pd     = getPlanDay(datum);
            const färg   = dagFärg[dagTyp] ?? "#5bc500";
            const isWeekend = dagTyp === "lördag" || dagTyp === "söndag" || dagTyp === "röd";

            return (
              <div key={d}
                onTouchStart={() => startHold(datum)}
                onTouchEnd={() => { endHold(); }}
                onTouchMove={() => endHold()}
                onClick={() => toggleDay(datum)}
                style={{
                  aspectRatio: "1", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  borderRadius: 10, cursor: "pointer",
                  background: pd ? `${färg}33` : "#001435",
                  border: `2px solid ${pd ? färg : isWeekend ? `${färg}44` : "#002169"}`,
                  transition: "all .15s",
                }}
              >
                <div style={{ color: pd ? färg : isWeekend ? `${färg}99` : "#5577aa", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 15 }}>{d}</div>
                {pd && <div style={{ width: 4, height: 4, borderRadius: "50%", background: färg, marginTop: 1 }} />}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          {[["💼", "#5bc500", "Vardag"], ["🛒", "#f5a623", "Lördag"], ["☀️", "#e05c5c", "Sön/Röd"]].map(([e,c,l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12 }}>{e}</span>
              <span style={{ color: "#5577aa", fontSize: 11 }}>{l}</span>
            </div>
          ))}
        </div>

        <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#5577aa", fontSize: 13 }}>Totalt planerade pass</span>
          <span style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20 }}>{totalt}</span>
        </div>

        <button onClick={() => onSave(plan)} style={{
          width: "100%", padding: 16, background: G, border: "none",
          borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
          cursor: "pointer", fontFamily: "Outfit, sans-serif",
        }}>Spara</button>
      </div>

      {editDay && (
        <div style={{ position: "absolute", inset: 0, background: "#000c", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, padding: 20 }}>
          <div style={{ background: "#001a50", borderRadius: 20, padding: 20, width: "100%" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              Justera öppettider
            </div>
            <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 16 }}>
              {(() => { const p = editDay.datum.split("-"); return `${parseInt(p[2])}/${parseInt(p[1])} · ${DAG_META[editDay.dagTyp]?.label}`; })()}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[["Start", "startMin"], ["Slut", "endMin"]].map(([lbl, key]) => (
                <div key={key}>
                  <div style={{ color: "#5577aa", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{lbl}</div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <button onClick={() => setEditDay(d => ({ ...d, [key]: Math.max(0, d[key] - 15) }))}
                      style={{ width: 36, height: 36, borderRadius: "8px 0 0 8px", background: G, border: "none", color: "#001435", fontSize: 20, fontWeight: 900, cursor: "pointer" }}>−</button>
                    <div style={{ flex: 1, height: 36, background: ND, display: "flex", alignItems: "center", justifyContent: "center", color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16, border: `1px solid ${N}`, borderLeft: "none", borderRight: "none" }}>
                      {minToHHMM(editDay[key])}
                    </div>
                    <button onClick={() => setEditDay(d => ({ ...d, [key]: Math.min(24*60, d[key] + 15) }))}
                      style={{ width: 36, height: 36, borderRadius: "0 8px 8px 0", background: G, border: "none", color: "#001435", fontSize: 20, fontWeight: 900, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditDay(null)} style={{ flex: 1, padding: 12, background: "transparent", border: `1px solid ${N}`, borderRadius: 12, color: "#5577aa", cursor: "pointer", fontFamily: "Outfit, sans-serif" }}>Avbryt</button>
              <button onClick={() => saveEditDay(editDay)} style={{ flex: 2, padding: 12, background: G, border: "none", borderRadius: 12, color: "#001435", fontWeight: 700, cursor: "pointer", fontFamily: "Outfit, sans-serif" }}>Spara tider</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stege-modal ──────────────────────────────────────────────────────────
function PeriodStegeEditor({ period, onChange }) {
  const stege   = period.tbStege ?? [];
  const kpiMål  = period.kpiMål ?? [];
  const special = period.specialRegel ?? { aktiv: false, snittGräns: 15000, snittProcent: 7, överskottProcent: 10 };

  function updateSteg(i, field, val) {
    const upd = stege.map((s, j) => j === i ? { ...s, [field]: parseFloat(val) || 0 } : s);
    onChange({ ...period, tbStege: upd });
  }
  function updateKPI(id, field, val) {
    const upd = kpiMål.map(k => k.id === id ? { ...k, [field]: field === "procent" || field === "mål" ? parseFloat(val) || 0 : val } : k);
    onChange({ ...period, kpiMål: upd });
  }
  function updateSpecial(field, val) {
    onChange({ ...period, specialRegel: { ...special, [field]: val } });
  }

  return (
    <div>
      {/* Datumintervall */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[["Startdatum", "startDatum"], ["Slutdatum", "slutDatum"]].map(([lbl, key]) => (
          <div key={key}>
            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{lbl}</div>
            <input type="date" value={period[key] ?? ""} onChange={e => onChange({ ...period, [key]: e.target.value })}
              style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "Outfit, sans-serif", colorScheme: "dark" }}
            />
          </div>
        ))}
      </div>

      {/* TB-stege */}
      <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>TB-stege</div>
      {stege.map((s, i) => (
        <div key={i} style={{ background: ND, border: `1px solid ${N}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Snitt från (kr/dag)</div>
            <input type="number" value={s.snitt} min={0} step={500} onChange={e => updateSteg(i, "snitt", e.target.value)}
              style={{ width: "100%", background: NC, border: `1px solid ${N}`, color: G, borderRadius: 6, padding: "7px 8px", fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>TB-procent (%)</div>
            <input type="number" value={s.procent} min={0} step={0.5} onChange={e => updateSteg(i, "procent", e.target.value)}
              style={{ width: "100%", background: NC, border: `1px solid ${N}`, color: G, borderRadius: 6, padding: "7px 8px", fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
            />
          </div>
          {i > 0 && (
            <button onClick={() => onChange({ ...period, tbStege: stege.filter((_, j) => j !== i) })}
              style={{ background: "transparent", border: "1px solid #440000", color: "#884444", borderRadius: 6, padding: "6px 8px", cursor: "pointer", fontSize: 14, marginTop: 14 }}>✕</button>
          )}
        </div>
      ))}
      <button onClick={() => onChange({ ...period, tbStege: [...stege, { snitt: 0, procent: 0 }] })}
        style={{ width: "100%", padding: "8px 0", background: "transparent", border: `1px solid ${N}`, color: "#5577aa", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "Outfit, sans-serif", marginBottom: 16 }}>
        + Lägg till steg
      </button>

      {/* KPI */}
      <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>KPI</div>
      {kpiMål.map(kpi => (
        <div key={kpi.id} style={{ background: ND, border: `1px solid #f5a62333`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input value={kpi.namn} placeholder="KPI-namn" onChange={e => updateKPI(kpi.id, "namn", e.target.value)}
              style={{ flex: 1, background: NC, border: `1px solid ${N}`, color: "#fff", borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "Outfit, sans-serif" }}
            />
            <button onClick={() => onChange({ ...period, kpiMål: kpiMål.filter(k => k.id !== kpi.id) })}
              style={{ background: "transparent", border: "1px solid #440000", color: "#884444", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Mål (st/dag)</div>
              <input type="number" value={kpi.mål} min={0} step={0.5} onChange={e => updateKPI(kpi.id, "mål", e.target.value)}
                style={{ width: "100%", background: NC, border: `1px solid #f5a62333`, color: "#f5a623", borderRadius: 6, padding: "7px 8px", fontSize: 14, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
            <div>
              <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Extra %</div>
              <input type="number" value={kpi.procent} min={0} step={0.5} onChange={e => updateKPI(kpi.id, "procent", e.target.value)}
                style={{ width: "100%", background: NC, border: `1px solid #f5a62333`, color: "#f5a623", borderRadius: 6, padding: "7px 8px", fontSize: 14, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
          </div>
        </div>
      ))}
      <button onClick={() => onChange({ ...period, kpiMål: [...kpiMål, { id: `kpi-${Date.now()}`, namn: "", mål: 3, procent: 1, aktiv: true }] })}
        style={{ width: "100%", padding: "8px 0", background: "transparent", border: "1px solid #f5a62344", color: "#f5a623", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "Outfit, sans-serif", marginBottom: 16 }}>
        + Lägg till KPI
      </button>

      {/* Tävlingsbonus */}
      <div style={{ background: period.bonusAktiv ? "#1a1200" : ND, border: `1px solid ${period.bonusAktiv ? "#f5a62355" : N}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: period.bonusAktiv ? "#f5a623" : "#5577aa", fontWeight: 600, fontSize: 13 }}>🏆 Tävlingsbonus</div>
            <div style={{ color: "#5577aa", fontSize: 11, marginTop: 2 }}>Visar bonusfält (0 / 500 / 1 000 kr) per pass</div>
          </div>
          <div onClick={() => onChange({ ...period, bonusAktiv: !period.bonusAktiv })} style={{
            width: 42, height: 24, borderRadius: 12, flexShrink: 0,
            background: period.bonusAktiv ? "#f5a623" : "#334",
            position: "relative", cursor: "pointer", transition: "background .2s",
          }}>
            <div style={{ position: "absolute", top: 3, left: period.bonusAktiv ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
          </div>
        </div>
      </div>

      {/* Specialregel */}
      <div style={{ background: special.aktiv ? "#0d1a00" : ND, border: `1px solid ${special.aktiv ? "#5bc50055" : N}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: special.aktiv ? 12 : 0 }}>
          <div>
            <div style={{ color: special.aktiv ? G : "#5577aa", fontWeight: 600, fontSize: 13 }}>💎 Specialregel (t.ex. Diamant-tävling)</div>
            <div style={{ color: "#5577aa", fontSize: 11, marginTop: 2 }}>Extra regler vid högt snitt-TB</div>
          </div>
          <div onClick={() => updateSpecial("aktiv", !special.aktiv)} style={{
            width: 42, height: 24, borderRadius: 12, flexShrink: 0,
            background: special.aktiv ? G : "#334",
            position: "relative", cursor: "pointer", transition: "background .2s",
          }}>
            <div style={{ position: "absolute", top: 3, left: special.aktiv ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
          </div>
        </div>
        {special.aktiv && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Snittgräns (kr/dag)</div>
              <input type="number" value={special.snittGräns ?? 15000} step={1000} onChange={e => updateSpecial("snittGräns", parseFloat(e.target.value)||0)}
                style={{ width: "100%", background: NC, border: `1px solid ${GD}55`, color: G, borderRadius: 6, padding: "7px 6px", fontSize: 13, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
            <div>
              <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>% hela TB</div>
              <input type="number" value={special.snittProcent ?? 7} step={0.5} onChange={e => updateSpecial("snittProcent", parseFloat(e.target.value)||0)}
                style={{ width: "100%", background: NC, border: `1px solid ${GD}55`, color: G, borderRadius: 6, padding: "7px 6px", fontSize: 13, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
            <div>
              <div style={{ color: "#5577aa", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>% överskott</div>
              <input type="number" value={special.överskottProcent ?? 10} step={0.5} onChange={e => updateSpecial("överskottProcent", parseFloat(e.target.value)||0)}
                style={{ width: "100%", background: NC, border: `1px solid ${GD}55`, color: G, borderRadius: 6, padding: "7px 6px", fontSize: 13, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StegeModal({ initialStege, initialKPI, initialBonus, initialPerioder, month, onSave, onSavePerioder, onCancel }) {
  const [läge, setLäge]             = useState(initialPerioder ? "perioder" : "enkel");
  const [stege, setStege]           = useState(initialStege.length > 0 ? initialStege : [{ snitt: 0, procent: 3 }]);
  const [kpiMål, setKpiMål]         = useState(initialKPI ?? []);
  const [bonusAktiv, setBonusAktiv] = useState(initialBonus ?? false);
  const [kopierad, setKopierad]     = useState(false);
  const [kodInput, setKodInput]     = useState("");
  const [kodFel, setKodFel]         = useState(false);
  const [aktivPeriod, setAktivPeriod] = useState(0);
  const [enkelSpecial, setEnkelSpecial] = useState({ aktiv: false, snittGräns: 15000, snittProcent: 7, överskottProcent: 10 });
  const [visaKod, setVisaKod]       = useState(false);
  const [genKod, setGenKod]         = useState("");

  const defaultPerioder = initialPerioder ?? [
    {
      id: "p1", namn: "Period 1",
      startDatum: `${month}-01`, slutDatum: `${month}-18`,
      tbStege: [{ snitt: 0, procent: 2 }, { snitt: 6000, procent: 3 }, { snitt: 8000, procent: 6 }],
      kpiMål: [{ id: "kpi-tjänster", namn: "Tjänster", mål: 3, procent: 1, aktiv: true }],
      bonusAktiv: false,
      specialRegel: { aktiv: false, snittGräns: 15000, snittProcent: 7, överskottProcent: 10 },
    },
    {
      id: "p2", namn: "Period 2",
      startDatum: `${month}-21`, slutDatum: `${month}-30`,
      tbStege: [{ snitt: 0, procent: 2 }, { snitt: 5000, procent: 3 }, { snitt: 7000, procent: 4 }, { snitt: 9000, procent: 5 }, { snitt: 12000, procent: 7 }],
      kpiMål: [],
      bonusAktiv: false,
      specialRegel: { aktiv: true, snittGräns: 15000, snittProcent: 7, överskottProcent: 10 },
    },
  ];
  const [perioder, setPerioder] = useState(defaultPerioder);

  function kopiera() {
    const kod = encodeMånad(läge, stege, kpiMål, bonusAktiv, enkelSpecial, perioder);
    setGenKod(kod);
    setVisaKod(true);
    navigator.clipboard?.writeText(kod).then(() => {
      setKopierad(true);
      setTimeout(() => setKopierad(false), 2000);
    }).catch(() => {});
  }

  function tillämpKod() {
    const result = decodeMånad(kodInput.trim()) ?? decodeProvision(kodInput.trim());
    if (!result) { setKodFel(true); setTimeout(() => setKodFel(false), 2000); return; }
    if (result.läge) setLäge(result.läge);
    if (result.stege?.length > 0) setStege(result.stege);
    if (result.kpiMål) setKpiMål(result.kpiMål);
    setBonusAktiv(result.bonusAktiv ?? false);
    if (result.enkelSpecial) setEnkelSpecial(result.enkelSpecial);
    if (result.perioder?.length > 0) setPerioder(result.perioder);
    setKodInput("");
    setVisaKod(false);
  }

  function updateSteg(i, field, val) {
    setStege(prev => prev.map((s, j) => j === i ? { ...s, [field]: parseFloat(val) || 0 } : s));
  }
  function updateKPI(id, field, val) {
    setKpiMål(prev => prev.map(k => k.id === id ? { ...k, [field]: field === "procent" || field === "mål" ? parseFloat(val) || 0 : val } : k));
  }

  const periodFärger = ["#5577aa", "#f5a623", G, "#e05c5c"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
      <div style={{
        width: "100%", background: "#001a50", borderRadius: "24px 24px 0 0",
        padding: "20px 18px 40px", animation: "slideUp .25s ease",
        maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Provision & stege</div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: "#5577aa", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 16, textTransform: "capitalize" }}>
          {new Date(month + "-01").toLocaleString("sv-SE", { month: "long", year: "numeric" })}
        </div>

        {/* Läge-växlare: Enkel / Perioder */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["enkel", "📅 Enkel (hel månad)"], ["perioder", "🗓 Perioder"]].map(([key, label]) => (
            <button key={key} onClick={() => setLäge(key)} style={{
              flex: 1, padding: "10px 0", border: "none", borderRadius: 10,
              background: läge === key ? G : NC,
              color: läge === key ? "#001435" : "#5577aa",
              fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "Outfit, sans-serif",
            }}>{label}</button>
          ))}
        </div>

        {/* ── ENKEL LÄGE ── */}
        {läge === "enkel" && (<>
          <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>TB-stege</div>
          {stege.map((s, i) => (
            <div key={i} style={{ background: NC, border: `1px solid ${N}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Snitt från (kr/dag)</div>
                <input type="number" value={s.snitt} min={0} step={500} onChange={e => updateSteg(i, "snitt", e.target.value)}
                  style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 8, padding: "10px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>TB-procent (%)</div>
                <input type="number" value={s.procent} min={0} step={0.5} onChange={e => updateSteg(i, "procent", e.target.value)}
                  style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 8, padding: "10px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                />
              </div>
              {i > 0 && (
                <button onClick={() => setStege(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: "transparent", border: "1px solid #440000", color: "#884444", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 16, marginTop: 18 }}>✕</button>
              )}
            </div>
          ))}
          <button onClick={() => setStege(prev => [...prev, { snitt: 0, procent: 0 }])}
            style={{ width: "100%", padding: "10px 0", background: "transparent", border: `1px solid ${N}`, color: "#5577aa", borderRadius: 10, cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif", marginBottom: 24 }}>
            + Lägg till steg
          </button>

          <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>KPI-provision</div>
          <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 12 }}>Varje uppnådd KPI adderar sin procent till TB-provisionen.</div>
          {kpiMål.map(kpi => (
            <div key={kpi.id} style={{ background: NC, border: `1px solid ${kpi.aktiv !== false ? "#f5a62344" : N}`, borderRadius: 12, padding: "14px", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <input value={kpi.namn} placeholder="Namn (t.ex. Kalibrering)" onChange={e => updateKPI(kpi.id, "namn", e.target.value)}
                  style={{ flex: 1, background: ND, border: `1px solid ${N}`, color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "Outfit, sans-serif" }}
                />
                <div onClick={() => updateKPI(kpi.id, "aktiv", !(kpi.aktiv !== false))} style={{
                  width: 42, height: 24, borderRadius: 12, flexShrink: 0,
                  background: kpi.aktiv !== false ? "#f5a623" : "#334",
                  position: "relative", cursor: "pointer", transition: "background .2s",
                }}>
                  <div style={{ position: "absolute", top: 3, left: kpi.aktiv !== false ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                </div>
                <button onClick={() => setKpiMål(prev => prev.filter(k => k.id !== kpi.id))}
                  style={{ background: "transparent", border: "1px solid #440000", color: "#884444", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Mål (st/dag snitt)</div>
                  <input type="number" value={kpi.mål} min={0} step={0.5} onChange={e => updateKPI(kpi.id, "mål", e.target.value)}
                    style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: "#f5a623", borderRadius: 8, padding: "8px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                  />
                </div>
                <div>
                  <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Extra provision (%)</div>
                  <input type="number" value={kpi.procent} min={0} step={0.5} onChange={e => updateKPI(kpi.id, "procent", e.target.value)}
                    style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: "#f5a623", borderRadius: 8, padding: "8px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                  />
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => setKpiMål(prev => [...prev, { id: `kpi-${Date.now()}`, namn: "", mål: 3, procent: 1, aktiv: true }])}
            style={{ width: "100%", padding: "10px 0", background: "transparent", border: "1px solid #f5a62344", color: "#f5a623", borderRadius: 10, cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif", marginBottom: 20 }}>
            + Lägg till KPI
          </button>

          <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Tävlingsbonus</div>
          <div style={{ background: NC, border: `1px solid ${bonusAktiv ? "#f5a62344" : N}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>Aktiv denna månad</div>
                <div style={{ color: "#5577aa", fontSize: 12, marginTop: 2 }}>Lägger till bonus-fält per pass (0 / 500 / 1 000 kr)</div>
              </div>
              <div onClick={() => setBonusAktiv(b => !b)} style={{
                width: 46, height: 26, borderRadius: 13, flexShrink: 0,
                background: bonusAktiv ? "#f5a623" : "#334",
                position: "relative", cursor: "pointer", transition: "background .2s",
              }}>
                <div style={{ position: "absolute", top: 3, left: bonusAktiv ? 22 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
              </div>
            </div>
          </div>

          {/* Specialregel i enkel-läge */}
          {(() => {
            const special = enkelSpecial;
            return (
              <div style={{ background: special.aktiv ? "#0d1a00" : NC, border: `1px solid ${special.aktiv ? `${GD}55` : N}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: special.aktiv ? 12 : 0 }}>
                  <div>
                    <div style={{ color: special.aktiv ? G : "#fff", fontWeight: 600, fontSize: 14 }}>💎 Specialregel</div>
                    <div style={{ color: "#5577aa", fontSize: 12, marginTop: 2 }}>Extra regler vid högt snitt-TB</div>
                  </div>
                  <div onClick={() => setEnkelSpecial(s => ({ ...s, aktiv: !s.aktiv }))} style={{
                    width: 46, height: 26, borderRadius: 13, flexShrink: 0,
                    background: special.aktiv ? G : "#334",
                    position: "relative", cursor: "pointer", transition: "background .2s",
                  }}>
                    <div style={{ position: "absolute", top: 3, left: special.aktiv ? 22 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                  </div>
                </div>
                {special.aktiv && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[["Snittgräns (kr/dag)", "snittGräns", 15000, 1000], ["% hela TB", "snittProcent", 7, 0.5], ["% överskott", "överskottProcent", 10, 0.5]].map(([lbl, key, def, step]) => (
                      <div key={key}>
                        <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{lbl}</div>
                        <input type="number" value={special[key] ?? def} step={step}
                          onChange={e => setEnkelSpecial(s => ({ ...s, [key]: parseFloat(e.target.value)||0 }))}
                          style={{ width: "100%", background: ND, border: `1px solid ${GD}55`, color: G, borderRadius: 8, padding: "8px 8px", fontSize: 14, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <button onClick={() => onSave(stege, kpiMål, bonusAktiv, enkelSpecial)} style={{
            width: "100%", padding: 16, background: G, border: "none",
            borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
            cursor: "pointer", fontFamily: "Outfit, sans-serif", marginBottom: 10,
          }}>Spara</button>

          <button onClick={kopiera} style={{
            width: "100%", padding: 12, background: kopierad ? `${G}22` : "transparent",
            border: `1px solid ${kopierad ? G : "#334"}`,
            borderRadius: 14, color: kopierad ? G : "#5577aa",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
            fontFamily: "Outfit, sans-serif", transition: "all .2s", marginBottom: 10,
          }}>
            {kopierad ? "✅ Kopierad till urklipp!" : "📤 Generera delningskod"}
          </button>

          {visaKod && (
            <div style={{ background: ND, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Din delningskod — markera och kopiera</div>
              <div style={{ color: G, fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", userSelect: "all" }}>{genKod}</div>
            </div>
          )}

          <div style={{ background: ND, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>📥 Ange delningskod från kollega</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={kodInput} onChange={e => setKodInput(e.target.value)} placeholder="LK- eller LK2-..."
                style={{ flex: 1, background: NC, border: `1px solid ${kodFel ? "#aa2222" : N}`, color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
              />
              <button onClick={tillämpKod} style={{
                background: kodFel ? "#440000" : N, border: "none", borderRadius: 8,
                color: kodFel ? "#ff6666" : G, fontWeight: 700, fontSize: 12,
                padding: "8px 12px", cursor: "pointer", fontFamily: "Outfit, sans-serif", whiteSpace: "nowrap",
              }}>{kodFel ? "Ogiltig!" : "Tillämpa"}</button>
            </div>
          </div>
        </>)}

        {/* ── PERIODER LÄGE ── */}
        {läge === "perioder" && (<>
          {/* Period-flikar */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {perioder.map((p, pi) => (
              <button key={p.id} onClick={() => setAktivPeriod(pi)} style={{
                flex: 1, padding: "10px 6px", border: "none", borderRadius: 10,
                background: aktivPeriod === pi ? periodFärger[pi] : NC,
                color: aktivPeriod === pi ? "#001435" : "#5577aa",
                fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "Outfit, sans-serif",
              }}>
                {p.namn || `Period ${pi + 1}`}
              </button>
            ))}
            {perioder.length < 4 && (
              <button onClick={() => {
                const [y, m] = month.split("-");
                setPerioder(prev => [...prev, {
                  id: `p${Date.now()}`, namn: `Period ${prev.length + 1}`,
                  startDatum: `${month}-01`, slutDatum: `${month}-30`,
                  tbStege: [{ snitt: 0, procent: 3 }], kpiMål: [], bonusAktiv: false,
                  specialRegel: { aktiv: false, snittGräns: 15000, snittProcent: 7, överskottProcent: 10 },
                }]);
                setAktivPeriod(perioder.length);
              }} style={{
                width: 36, padding: "10px 0", border: `1px solid ${N}`, borderRadius: 10,
                background: "transparent", color: "#5577aa", fontSize: 18,
                cursor: "pointer", fontFamily: "Outfit, sans-serif",
              }}>+</button>
            )}
          </div>

          {/* Aktiv period namn */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Periodnamn</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={perioder[aktivPeriod]?.namn ?? ""} placeholder="t.ex. Period 1"
                onChange={e => setPerioder(prev => prev.map((p, i) => i === aktivPeriod ? { ...p, namn: e.target.value } : p))}
                style={{ flex: 1, background: ND, border: `1px solid ${N}`, color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 14, fontFamily: "Outfit, sans-serif" }}
              />
              {perioder.length > 1 && (
                <button onClick={() => { setPerioder(prev => prev.filter((_, i) => i !== aktivPeriod)); setAktivPeriod(0); }}
                  style={{ background: "transparent", border: "1px solid #440000", color: "#884444", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif" }}>
                  Ta bort
                </button>
              )}
            </div>
          </div>

          {/* Period-editor */}
          {perioder[aktivPeriod] && (
            <PeriodStegeEditor
              period={perioder[aktivPeriod]}
              onChange={upd => setPerioder(prev => prev.map((p, i) => i === aktivPeriod ? upd : p))}
            />
          )}

          <div style={{ height: 20 }} />

          <button onClick={() => onSavePerioder(perioder)} style={{
            width: "100%", padding: 16, background: G, border: "none",
            borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
            cursor: "pointer", fontFamily: "Outfit, sans-serif", marginBottom: 10,
          }}>Spara perioder</button>

          <button onClick={kopiera} style={{
            width: "100%", padding: 12, background: kopierad ? `${G}22` : "transparent",
            border: `1px solid ${kopierad ? G : "#334"}`,
            borderRadius: 14, color: kopierad ? G : "#5577aa",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
            fontFamily: "Outfit, sans-serif", transition: "all .2s", marginBottom: 10,
          }}>
            {kopierad ? "✅ Kopierad till urklipp!" : "📤 Generera delningskod (alla perioder)"}
          </button>

          {visaKod && (
            <div style={{ background: ND, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Din delningskod — markera och kopiera</div>
              <div style={{ color: G, fontSize: 11, fontFamily: "monospace", wordBreak: "break-all", userSelect: "all" }}>{genKod}</div>
            </div>
          )}

          <div style={{ background: ND, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>📥 Ange delningskod från kollega</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={kodInput} onChange={e => setKodInput(e.target.value)} placeholder="LK- eller LK2-..."
                style={{ flex: 1, background: NC, border: `1px solid ${kodFel ? "#aa2222" : N}`, color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "monospace" }}
              />
              <button onClick={tillämpKod} style={{
                background: kodFel ? "#440000" : N, border: "none", borderRadius: 8,
                color: kodFel ? "#ff6666" : G, fontWeight: 700, fontSize: 12,
                padding: "8px 12px", cursor: "pointer", fontFamily: "Outfit, sans-serif", whiteSpace: "nowrap",
              }}>{kodFel ? "Ogiltig!" : "Tillämpa"}</button>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ─── Svenska helgdagar ────────────────────────────────────────────────────
function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31);
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getSwedishHolidays(year) {
  const easter = easterDate(year);
  const d = (date) => date.toISOString().slice(0, 10);
  const offset = (base, days) => { const dt = new Date(base); dt.setDate(dt.getDate() + days); return dt; };

  const holidays = new Set([
    `${year}-01-01`,
    `${year}-01-06`,
    d(offset(easter, -2)),
    d(easter),
    d(offset(easter, 1)),
    `${year}-05-01`,
    d(offset(easter, 39)),
    d(offset(easter, 49)),
    `${year}-06-06`,
    `${year}-12-25`,
    `${year}-12-26`,
  ]);

  for (let day = 20; day <= 26; day++) {
    const dt = new Date(year, 5, day);
    if (dt.getDay() === 6) { holidays.add(d(dt)); break; }
  }
  for (let day = 31; day <= 37; day++) {
    const dt = new Date(year, day > 31 ? 10 : 9, day > 31 ? day - 31 : day);
    if (dt.getDay() === 6) { holidays.add(d(dt)); break; }
  }
  return holidays;
}

function getDagTypFromDate(dateStr) {
  if (!dateStr) return null;
  const dt = new Date(dateStr + "T12:00:00");
  const year = dt.getFullYear();
  const holidays = getSwedishHolidays(year);
  if (holidays.has(dateStr)) return "röd";
  const dow = dt.getDay();
  if (dow === 0) return "söndag";
  if (dow === 6) return "lördag";
  return "vardag";
}

function DayForm({ settings, initialDay, onSave, onSaveMonth, onSaveDefault, onCancel, kpiMål, bonusAktiv, getPeriodBonusAktiv }) {
  const getDefaults = (typ) => settings.defaults?.[typ] || {};
  const activeKPIs  = (kpiMål ?? []).filter(k => k.aktiv !== false);

  const [formTab, setFormTab]     = useState(initialDay ? "pass" : "pass");
  const [dagTyp, setDagTyp]       = useState(initialDay?.dagTyp  ?? "vardag");
  const [startMin, setStartMin]   = useState(initialDay?.startMin ?? getDefaults("vardag").start ?? 9*60+45);
  const [endMin, setEndMin]       = useState(initialDay?.endMin   ?? getDefaults("vardag").end   ?? 19*60);
  const [prov, setProv]           = useState(initialDay?.provision ?? getDefaults("vardag").prov ?? 400);
  const [passTyp, setPassTyp]     = useState(initialDay?.passTyp ?? "sälj");
  const [tb, setTb]               = useState(initialDay?.tb ?? "");
  const [skott, setSkott]         = useState(initialDay?.skott ?? "");
  // Tjänster — använd namn som nyckel (stabilt), migrera gamla id-baserade värden
  const [tjänster, setTjänster] = useState(() => {
    const raw = initialDay?.tjänster ?? {};
    // Om nycklarna matchar kpiMål-namn redan → använd direkt
    const kpiNamn = (kpiMål ?? []).map(k => k.namn);
    const harNamnNycklar = Object.keys(raw).some(k => kpiNamn.includes(k));
    if (harNamnNycklar || Object.keys(raw).length === 0) return raw;
    // Migrera: id → namn
    const migrated = {};
    (kpiMål ?? []).forEach(k => {
      const val = raw[k.id] ?? raw[k.namn] ?? 0;
      if (val > 0) migrated[k.namn] = val;
    });
    return migrated;
  });
  const [bonus, setBonus]         = useState(initialDay?.bonus ?? 0);
  const [datum, setDatum]         = useState(initialDay?.datum ?? "");
  const [savedDefault, setSavedDefault] = useState(false);
  // Bonus aktiv — uppdateras när datum väljs om getPeriodBonusAktiv finns
  const [aktivBonus, setAktivBonus] = useState(() => {
    if (getPeriodBonusAktiv && initialDay?.datum) return getPeriodBonusAktiv(initialDay.datum);
    return bonusAktiv;
  });

  const [mVardagar, setMVardagar]   = useState(0);
  const [mLördagar, setMLördagar]   = useState(0);
  const [mSöndagar, setMSöndagar]   = useState(0);
  const [mRöda, setMRöda]           = useState(0);
  const [mKassa, setMKassa]         = useState(0);
  const [mTotalTB, setMTotalTB]     = useState("");
  const [mSnittSkott, setMSnittSkott] = useState("");

  function changeDagTyp(typ) {
    setDagTyp(typ);
    if (!initialDay) {
      const d = settings.defaults?.[typ];
      if (d) { setStartMin(d.start); setEndMin(d.end); setProv(d.prov ?? 400); }
    }
  }

  const breakMin  = getBreakMin(dagTyp);
  const pay     = calcDayPay(dagTyp, startMin, endMin, settings.timlön);
  const basePay = ((endMin - startMin) - breakMin) / 60 * settings.timlön;
  const ob      = pay - basePay;
  const total   = pay + (prov || 0);

  function nudge(setter, cur, delta, min = 0, max = 24*60) {
    setter(Math.min(max, Math.max(min, cur + delta)));
  }

  function TimeControl({ label, value, onChange }) {
    return (
      <div>
        <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <button onClick={() => nudge(onChange, value, -15)} style={nudgeBtn}>−15</button>
          <div style={{
            flex: 1, textAlign: "center", color: G,
            fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 22,
            background: ND, padding: "10px 0",
            border: `1px solid ${N}`, borderLeft: "none", borderRight: "none",
          }}>{minToHHMM(value)}</div>
          <button onClick={() => nudge(onChange, value, +15)} style={{...nudgeBtn, borderRadius: "0 10px 10px 0"}}>+15</button>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {[-60, -30, +30, +60].map(d => (
            <button key={d} onClick={() => nudge(onChange, value, d)} style={{
              flex: 1, padding: "5px 0", background: "transparent",
              border: `1px solid ${N}`, borderRadius: 6, color: "#5577aa",
              fontSize: 11, cursor: "pointer", fontFamily: "Outfit, sans-serif",
            }}>{d > 0 ? `+${d/60}h` : `${d/60}h`}</button>
          ))}
        </div>
      </div>
    );
  }

  const nudgeBtn = {
    padding: "10px 14px", background: N, border: `1px solid ${N}`,
    borderRadius: "10px 0 0 10px", color: G, fontWeight: 700,
    cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000c",
      display: "flex", alignItems: "flex-end", zIndex: 100,
    }}>
      <div style={{
        width: "100%", background: "#001a50",
        borderRadius: "24px 24px 0 0",
        padding: "20px 18px 40px",
        animation: "slideUp .25s ease",
        maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
            {initialDay ? "Redigera pass" : "Lägg till"}
          </div>
          <button onClick={onCancel} style={{
            background: "transparent", border: "none", color: "#5577aa", fontSize: 22, cursor: "pointer",
          }}>✕</button>
        </div>

        {!initialDay && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {[["pass", "📅 Enskilt pass"], ["månad", "📆 Hel månad"]].map(([key, label]) => (
              <button key={key} onClick={() => setFormTab(key)} style={{
                flex: 1, padding: "11px 0", border: "none", borderRadius: 12,
                background: formTab === key ? G : NC,
                color: formTab === key ? "#001435" : "#5577aa",
                fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "Outfit, sans-serif",
              }}>{label}</button>
            ))}
          </div>
        )}

        {/* ── HEL MÅNAD ── */}
        {formTab === "månad" && (() => {
          function MStep({ label, sublabel, value, onChange }) {
            return (
              <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{label}</div>
                  {sublabel && <div style={{ color: "#5577aa", fontSize: 11, marginTop: 2 }}>{sublabel}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button onClick={() => onChange(Math.max(0, value - 1))} style={{ width: 38, height: 38, borderRadius: "10px 0 0 10px", background: G, border: "none", color: "#001435", fontSize: 22, fontWeight: 900, cursor: "pointer" }}>−</button>
                  <div style={{ width: 44, height: 38, background: ND, display: "flex", alignItems: "center", justifyContent: "center", color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20, borderTop: `1px solid ${N}`, borderBottom: `1px solid ${N}` }}>{value}</div>
                  <button onClick={() => onChange(value + 1)} style={{ width: 38, height: 38, borderRadius: "0 10px 10px 0", background: G, border: "none", color: "#001435", fontSize: 22, fontWeight: 900, cursor: "pointer" }}>+</button>
                </div>
              </div>
            );
          }

          const lön = (typ, antal) => antal * calcDayPay(typ, getDefaults(typ).start ?? 9*60, getDefaults(typ).end ?? 17*60, settings.timlön);
          const totalLön = lön("vardag", mVardagar) + lön("lördag", mLördagar) + lön("söndag", mSöndagar) + lön("röd", mRöda);
          const totalSkott = mKassa * (parseFloat(mSnittSkott) || 0);
          const totalDagar = mVardagar + mLördagar + mSöndagar + mRöda + mKassa;

          return (
            <div>
              <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Antal dagar</div>
              <MStep label="💼 Vardagar" value={mVardagar} onChange={setMVardagar} />
              <MStep label="🛒 Lördagar" value={mLördagar} onChange={setMLördagar} />
              <MStep label="☀️ Söndagar" value={mSöndagar} onChange={setMSöndagar} />
              <MStep label="🔴 Röda dagar" value={mRöda} onChange={setMRöda} />
              <MStep label="🔧 Kassa / Lagerdagar" sublabel="Ange snitt skottpengar nedan" value={mKassa} onChange={setMKassa} />

              {mKassa > 0 && (<>
                <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Snitt skottpengar per kassadag (kr)</div>
                <input type="number" value={mSnittSkott} step={100} min={0} placeholder="0"
                  onChange={e => setMSnittSkott(e.target.value)}
                  style={{ width: "100%", background: ND, border: `1px solid #f5a62355`, color: "#f5a623", borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, marginBottom: 16 }}
                />
              </>)}

              <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6, marginTop: 4 }}>Total TB för månaden (kr)</div>
              <input type="number" value={mTotalTB} step={1000} min={0} placeholder="0"
                onChange={e => setMTotalTB(e.target.value)}
                style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, marginBottom: 16 }}
              />

              {totalDagar > 0 && (
                <div style={{ background: `${G}12`, border: `1px solid ${GD}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ color: "#5577aa", fontSize: 11, marginBottom: 8 }}>{totalDagar} dagar · {mVardagar}V {mLördagar}L {mSöndagar}S {mRöda}R {mKassa}K</div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: "#8899cc", fontSize: 11 }}>Timlön</div>
                      <div style={{ color: "#c8deff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>{Math.round(totalLön).toLocaleString("sv-SE")} kr</div>
                    </div>
                    {parseFloat(mTotalTB) > 0 && <div>
                      <div style={{ color: "#8899cc", fontSize: 11 }}>TB</div>
                      <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>{Number(mTotalTB).toLocaleString("sv-SE")} kr</div>
                    </div>}
                    {totalSkott > 0 && <div>
                      <div style={{ color: "#8899cc", fontSize: 11 }}>Skottpengar</div>
                      <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>{Math.round(totalSkott).toLocaleString("sv-SE")} kr</div>
                    </div>}
                  </div>
                </div>
              )}

              <button onClick={() => onSaveMonth({
                vardagar: mVardagar, lördagar: mLördagar, söndagar: mSöndagar, röda: mRöda,
                kassaDagar: mKassa, totalTB: parseFloat(mTotalTB) || 0,
                skott: totalSkott, säljDagar: mVardagar + mLördagar + mSöndagar + mRöda,
              })} style={{
                width: "100%", padding: 16, background: G, border: "none",
                borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
                cursor: "pointer", fontFamily: "Outfit, sans-serif",
              }}>Spara hel månad</button>
            </div>
          );
        })()}

        {/* ── ENSKILT PASS ── */}
        {(formTab === "pass" || initialDay) && (<>

        {/* 1. DATUM FÖRST */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: datum ? "#5577aa" : "#f5a623", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            📅 Datum <span style={{ color: datum ? "#334" : "#f5a623" }}>*</span>
          </div>
          <input
            type="date" lang="sv" value={datum}
            onChange={e => {
              const val = e.target.value;
              setDatum(val);
              if (getPeriodBonusAktiv) setAktivBonus(getPeriodBonusAktiv(val));
              if (!initialDay && val) {
                const detectedTyp = getDagTypFromDate(val);
                if (detectedTyp) {
                  setDagTyp(detectedTyp);
                  const d = settings.defaults?.[detectedTyp];
                  if (d) { setStartMin(d.start); setEndMin(d.end); setProv(d.prov ?? 400); }
                }
              }
            }}
            style={{
              width: "100%", background: ND,
              border: `1px solid ${datum ? N : "#f5a62366"}`,
              color: datum ? "#fff" : "#5577aa", borderRadius: 10, padding: "10px 14px",
              fontSize: 15, fontFamily: "Outfit, sans-serif", colorScheme: "dark",
            }}
          />
          {!datum && <div style={{ color: "#f5a623", fontSize: 11, marginTop: 6 }}>Välj datum — dagtyp och tider sätts automatiskt</div>}
          {datum && <div style={{ color: "#5577aa", fontSize: 11, marginTop: 6 }}>
            {(() => { const p = datum.split("-"); return `${parseInt(p[2])}/${parseInt(p[1])}/${p[0]}`; })()}
            {" · "}{(() => { const t = getDagTypFromDate(datum); return t ? {vardag:"Vardag",lördag:"Lördag",söndag:"Söndag",röd:"Röd dag"}[t] : ""; })()}
          </div>}
        </div>

        {/* 2. DAGTYP */}
        <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Dagtyp</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {Object.entries(DAG_META).map(([typ, meta]) => (
            <button key={typ} onClick={() => changeDagTyp(typ)} style={{
              flex: 1, padding: "10px 4px", border: "none", borderRadius: 10,
              background: dagTyp === typ ? meta.color : NC,
              color: dagTyp === typ ? "#001435" : "#5577aa",
              fontWeight: 700, fontSize: 12, cursor: "pointer",
              fontFamily: "Outfit, sans-serif",
            }}>{meta.emoji}<br/>{meta.label}</button>
          ))}
        </div>

        {/* 3. TIDER */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <TimeControl label="Starttid" value={startMin} onChange={setStartMin} />
          <TimeControl label="Sluttid"  value={endMin}   onChange={setEndMin}   />
        </div>

        {/* 4. PASSTYP */}
        <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Passtyp</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["sälj", "💼 Säljdag", G], ["annan", "🔧 Kassa / Lager", "#f5a623"]].map(([val, label, color]) => (
            <button key={val} onClick={() => setPassTyp(val)} style={{
              flex: 1, padding: "12px 8px", border: "none", borderRadius: 10,
              background: passTyp === val ? color : NC,
              color: passTyp === val ? "#001435" : "#5577aa",
              fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "Outfit, sans-serif",
            }}>{label}</button>
          ))}
        </div>

        {passTyp === "sälj" ? (<>
          <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>TB (kr)</div>
          <input
            type="number" value={tb} step={500} min={0}
            onChange={e => setTb(parseFloat(e.target.value) || "")}
            placeholder="0"
            style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, marginBottom: activeKPIs.length > 0 ? 14 : 20 }}
          />

          {activeKPIs.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Tjänster</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {activeKPIs.map(kpi => (
                  <div key={kpi.id}>
                    <div style={{ color: "#5577aa", fontSize: 11, marginBottom: 4 }}>{kpi.namn || "KPI"} (mål: {kpi.mål})</div>
                    <input type="number" min={0} step={1}
                      value={tjänster[kpi.namn] ?? tjänster[kpi.id] ?? ""}
                      placeholder="0"
                      onChange={e => setTjänster(prev => ({ ...prev, [kpi.namn]: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", background: ND, border: `1px solid #f5a62344`, color: "#f5a623", borderRadius: 8, padding: "10px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>) : (<>
          <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Skottpengar (kr)</div>
          <input
            type="number" value={skott} step={100} min={0}
            onChange={e => setSkott(parseFloat(e.target.value) || "")}
            placeholder="0"
            style={{ width: "100%", background: ND, border: `1px solid #f5a62355`, color: "#f5a623", borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, marginBottom: 20 }}
          />
        </>)}

        <div style={{ background: `${G}10`, border: `1px solid ${GD}`, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ color: "#5577aa", fontSize: 11, marginBottom: 6 }}>
            {minToHHMM(startMin)} – {minToHHMM(endMin)} &nbsp;·&nbsp; {((endMin - startMin)/60).toFixed(2).replace(".", ",")} timmar
            {breakMin > 0 && <span style={{ color: "#f5a623" }}> &nbsp;·&nbsp; {breakMin} min rast</span>}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div>
              <div style={{ color: "#8899cc", fontSize: 11 }}>Timlön</div>
              <div style={{ color: "#c8deff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>{fmt(basePay)}</div>
            </div>
            {ob > 0 && <div>
              <div style={{ color: "#8899cc", fontSize: 11 }}>OB-tillägg</div>
              <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>+{fmt(ob)}</div>
            </div>}
            {passTyp === "sälj" && tb > 0 && <div>
              <div style={{ color: "#8899cc", fontSize: 11 }}>TB</div>
              <div style={{ color: "#c8deff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>{Number(tb).toLocaleString("sv-SE")} kr</div>
            </div>}
            {passTyp === "annan" && skott > 0 && <div>
              <div style={{ color: "#8899cc", fontSize: 11 }}>Skottpengar</div>
              <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>{Number(skott).toLocaleString("sv-SE")} kr</div>
            </div>}
          </div>
          <div style={{ borderTop: `1px solid ${N}`, marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#8899cc", fontSize: 12 }}>Totalt detta pass</span>
            <span style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 22 }}>{fmt(total)}</span>
          </div>
        </div>

        {aktivBonus && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🏆 Tävlingsbonus</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[0, 500, 1000].map(val => (
                <button key={val} onClick={() => setBonus(val)} style={{
                  flex: 1, padding: "12px 0", border: "none", borderRadius: 12,
                  background: bonus === val ? (val === 0 ? NC : "#f5a623") : NC,
                  color: bonus === val ? (val === 0 ? "#5577aa" : "#001435") : "#5577aa",
                  fontWeight: 700, fontSize: 15, cursor: "pointer",
                  fontFamily: "Rajdhani, sans-serif",
                  border: bonus === val && val === 0 ? `1px solid #334` : bonus === val ? "none" : `1px solid ${N}`,
                }}>
                  {val === 0 ? "Ingen" : `+${val} kr`}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            onSaveDefault(dagTyp, startMin, endMin, prov);
            setSavedDefault(true);
            setTimeout(() => setSavedDefault(false), 2000);
          }}
          style={{
            width: "100%", padding: "10px 0", marginBottom: 12,
            background: savedDefault ? `${G}22` : "transparent",
            border: `1px solid ${savedDefault ? G : "#334"}`,
            borderRadius: 10, color: savedDefault ? G : "#5577aa",
            cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif",
            transition: "all .2s",
          }}
        >
          {savedDefault ? `✓ Sparat som standard för ${DAG_META[dagTyp].label}` : `⭐ Spara som standard för ${DAG_META[dagTyp].label}`}
        </button>

        <button onClick={() => onSave({
          id: initialDay?.id ?? uid(),
          dagTyp, startMin, endMin,
          passTyp,
          tb: passTyp === "sälj" ? (parseFloat(tb) || 0) : 0,
          skott: passTyp === "annan" ? (parseFloat(skott) || 0) : 0,
          tjänster: passTyp === "sälj" ? tjänster : {},
          bonus: bonus || 0,
          datum: datum || "",
          registrerad: initialDay?.registrerad ?? Date.now(),
        })} disabled={!datum} style={{
          width: "100%", padding: 16, background: datum ? G : "#334", border: "none",
          borderRadius: 14, color: datum ? "#001435" : "#556", fontWeight: 700, fontSize: 17,
          cursor: datum ? "pointer" : "not-allowed", fontFamily: "Outfit, sans-serif",
          opacity: datum ? 1 : 0.6,
        }}>
          {initialDay ? "Spara ändringar" : "Lägg till pass"}
        </button>
        </>)}
      </div>
    </div>
  );
}

// ─── Inställningar ────────────────────────────────────────────────────────
function SettingsPanel({ settings, setSettings, onRunOnboarding }) {
  function set(key, val) { setSettings(p => ({ ...p, [key]: val })); }
  function setDefault(dagTyp, field, val) {
    setSettings(p => ({
      ...p,
      defaults: { ...p.defaults, [dagTyp]: { ...p.defaults[dagTyp], [field]: val } }
    }));
  }

  return (
    <div>
      <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>Grundinställningar</div>
      <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
        {[
          ["Timlön (kr)", "timlön", 0.5],
          ["Skattesats (%)", "skatt", 1],
        ].map(([label, key, step]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ color: "#5577aa", fontSize: 12, display: "block", marginBottom: 5, fontWeight: 600 }}>{label}</label>
            <input
              type="number" value={settings[key]} step={step} min={0}
              onChange={e => set(key, parseFloat(e.target.value) || 0)}
              style={{
                width: "100%", background: ND, border: `1px solid ${N}`,
                color: G, borderRadius: 10, padding: "10px 14px",
                fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
              }}
            />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div onClick={() => set("semesterLön", !settings.semesterLön)} style={{
            width: 46, height: 26, borderRadius: 13,
            background: settings.semesterLön ? G : "#002a7a",
            position: "relative", transition: "background .2s", cursor: "pointer", flexShrink: 0,
          }}>
            <div style={{
              position: "absolute", top: 3,
              left: settings.semesterLön ? 23 : 3,
              width: 20, height: 20, borderRadius: "50%",
              background: settings.semesterLön ? "#001435" : "#445",
              transition: "left .2s",
            }} />
          </div>
          <span style={{ color: "#c8deff", fontSize: 14 }}>Visa semesterlön (+13%)</span>
        </div>
      </div>

      <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Provisionsstege (TB-snitt/dag)</div>
      <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 10 }}>Justeras varje månad. Provision räknas på total TB × procent.</div>
      {(settings.tbStege ?? []).map((steg, i) => (
        <div key={i} style={{ background: NC, border: `1px solid ${N}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Snitt från (kr/dag)</div>
            <input type="number" value={steg.snitt} min={0} step={500}
              onChange={e => {
                const updated = settings.tbStege.map((s, j) => j === i ? { ...s, snitt: parseFloat(e.target.value) || 0 } : s);
                setSettings(p => ({ ...p, tbStege: updated }));
              }}
              style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 8, padding: "8px 10px", fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Procent (%)</div>
            <input type="number" value={steg.procent} min={0} step={0.5}
              onChange={e => {
                const updated = settings.tbStege.map((s, j) => j === i ? { ...s, procent: parseFloat(e.target.value) || 0 } : s);
                setSettings(p => ({ ...p, tbStege: updated }));
              }}
              style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 8, padding: "8px 10px", fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
            />
          </div>
          {i > 0 && (
            <button onClick={() => setSettings(p => ({ ...p, tbStege: p.tbStege.filter((_, j) => j !== i) }))}
              style={{ background: "transparent", border: "1px solid #440000", color: "#884444", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontSize: 16, marginTop: 18 }}>✕</button>
          )}
        </div>
      ))}
      <button onClick={() => setSettings(p => ({ ...p, tbStege: [...(p.tbStege ?? []), { snitt: 0, procent: 0 }] }))}
        style={{ width: "100%", padding: "10px 0", background: "transparent", border: `1px solid ${N}`, color: "#5577aa", borderRadius: 10, cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif", marginBottom: 20 }}>
        + Lägg till steg
      </button>

      <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Standardvärden per dagtyp</div>
      <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 14 }}>
        Dessa värden fylls i automatiskt när du lägger till ett nytt pass.
      </div>

      {Object.entries(DAG_META).map(([typ, meta]) => {
        const d = settings.defaults?.[typ] || {};
        const startVal = minToHHMM(d.start ?? 9*60);
        const endVal   = minToHHMM(d.end   ?? 17*60);
        const provVal  = d.prov ?? 400;

        return (
          <div key={typ} style={{ background: NC, border: `1px solid ${N}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ color: meta.color, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
              {meta.emoji} {meta.label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              {[["Starttid", "start", startVal], ["Sluttid", "end", endVal]].map(([label, field, val]) => (
                <div key={field}>
                  <div style={{ color: "#5577aa", fontSize: 11, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                  <input
                    type="time"
                    value={val}
                    onChange={e => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      setDefault(typ, field, h * 60 + m);
                    }}
                    style={{
                      width: "100%", background: ND, border: `1px solid ${N}`,
                      color: G, borderRadius: 8, padding: "8px 10px",
                      fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                      colorScheme: "dark",
                    }}
                  />
                </div>
              ))}
            </div>
            <div>
              <div style={{ color: "#5577aa", fontSize: 11, marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Provision (kr)</div>
              <input
                type="number"
                value={provVal}
                step={50}
                min={0}
                onChange={e => setDefault(typ, "prov", parseFloat(e.target.value) || 0)}
                style={{
                  width: "100%", background: ND, border: `1px solid ${N}`,
                  color: G, borderRadius: 8, padding: "8px 10px",
                  fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700,
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Kör setup igen */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${N}` }}>
        <button onClick={onRunOnboarding} style={{
          width: "100%", padding: 14, background: "transparent",
          border: `1px solid ${N}`, borderRadius: 14,
          color: "#5577aa", fontWeight: 600, fontSize: 15,
          cursor: "pointer", fontFamily: "Outfit, sans-serif",
        }}>
          🔄 Kör grundinställningar igen
        </button>
      </div>
    </div>
  );
}

// ─── Onboarding Modal ─────────────────────────────────────────────────────
function OnboardingModal({ initialSettings, onDone }) {
  const [steg, setSteg] = useState(0);
  const [timlön, setTimlön] = useState(initialSettings.timlön ?? 172);
  const [skatt, setSkatt]   = useState(initialSettings.skatt ?? 30);
  const [semTyp, setSemTyp] = useState(initialSettings.semesterTyp ?? "månadsvis");
  const [defaults, setDefaults] = useState(initialSettings.defaults ?? DEF_SETTINGS.defaults);

  const totalSteg = 5;

  function setDefault(dagTyp, field, val) {
    setDefaults(prev => ({ ...prev, [dagTyp]: { ...prev[dagTyp], [field]: val } }));
  }

  function spara() {
    onDone({
      ...initialSettings,
      timlön, skatt,
      semesterLön: true,
      semesterTyp: semTyp,
      defaults,
    });
  }

  const stegFärg = ["#5577aa", G, "#f5a623", G, "#f5a623"];
  const stegTitlar = ["Välkommen", "Din timlön", "Skatt", "Semester", "Standardtider"];

  return (
    <div style={{ position: "fixed", inset: 0, background: ND, zIndex: 300, display: "flex", flexDirection: "column", fontFamily: "Outfit, sans-serif" }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Progress-bar */}
      <div style={{ background: N, padding: "18px 18px 14px" }}>
        <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>LÖNEKOLLEN</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {Array.from({ length: totalSteg }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= steg ? stegFärg[steg] : "#334", transition: "background .3s" }} />
          ))}
        </div>
        <div style={{ color: "#5577aa", fontSize: 12 }}>Steg {steg + 1} av {totalSteg} — {stegTitlar[steg]}</div>
      </div>

      {/* Innehåll */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 20px" }}>

        {/* Steg 1: Välkommen */}
        {steg === 0 && (
          <div style={{ animation: "fadeIn .3s ease", textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 20 }}>👋</div>
            <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 32, marginBottom: 12 }}>Välkommen till LöneKollen!</div>
            <div style={{ color: "#5577aa", fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>
              Appen beräknar din faktiska lön på Elgiganten — timlön med Handels OB, TB-provision och KPI.
            </div>
            <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 16, padding: "16px 18px", textAlign: "left", marginBottom: 24 }}>
              {[
                ["📅", "Registrera varje pass med tider och TB"],
                ["💰", "Se din bruttolön och netto direkt"],
                ["⚡", "Gnistan visar live-räknare medan du jobbar"],
                ["📊", "Följ upp mot provision och dagsmål"],
              ].map(([emoji, text]) => (
                <div key={text} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${N}` }}>
                  <span style={{ fontSize: 20 }}>{emoji}</span>
                  <span style={{ color: "#c8deff", fontSize: 14 }}>{text}</span>
                </div>
              ))}
            </div>
            <div style={{ color: "#5577aa", fontSize: 13 }}>Sätt upp din profil på under en minut 👇</div>
          </div>
        )}

        {/* Steg 2: Timlön */}
        {steg === 1 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>💼</div>
            <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 28, textAlign: "center", marginBottom: 8 }}>Din timlön</div>
            <div style={{ color: "#5577aa", fontSize: 14, textAlign: "center", marginBottom: 28 }}>Grundlönen du har per timme enligt ditt avtal</div>
            <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 16, padding: "20px 18px", marginBottom: 16 }}>
              <div style={{ color: "#5577aa", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Timlön (kr)</div>
              <input type="number" value={timlön} step={0.5} min={0}
                onChange={e => setTimlön(parseFloat(e.target.value) || 0)}
                style={{ width: "100%", background: ND, border: `1px solid ${G}44`, color: G, borderRadius: 12, padding: "16px 18px", fontSize: 28, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[155, 163, 172, 180, 190].map(v => (
                <button key={v} onClick={() => setTimlön(v)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                  background: timlön === v ? G : NC,
                  border: `1px solid ${timlön === v ? G : N}`,
                  color: timlön === v ? "#001435" : "#5577aa",
                  fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 15,
                }}>{v} kr</button>
              ))}
            </div>
          </div>
        )}

        {/* Steg 3: Skatt */}
        {steg === 2 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>🧾</div>
            <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 28, textAlign: "center", marginBottom: 8 }}>Skattenivå</div>
            <div style={{ color: "#5577aa", fontSize: 14, textAlign: "center", marginBottom: 28 }}>Används för att räkna ut din nettolön</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {[
                [28, "Låg skatt (28%)"],
                [30, "Standard (30%) — vanligast"],
                [32, "Högre skatt (32%)"],
              ].map(([v, label]) => (
                <button key={v} onClick={() => setSkatt(v)} style={{
                  padding: "16px 18px", borderRadius: 14, cursor: "pointer", textAlign: "left",
                  background: skatt === v ? `${G}20` : NC,
                  border: `2px solid ${skatt === v ? G : N}`,
                  fontFamily: "Outfit, sans-serif",
                }}>
                  <div style={{ color: skatt === v ? G : "#fff", fontWeight: 700, fontSize: 16 }}>{label}</div>
                </button>
              ))}
            </div>
            <div style={{ background: NC, border: `1px solid ${N}`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ color: "#5577aa", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Eller ange exakt:</div>
              <input type="number" value={skatt} step={1} min={0} max={60}
                onChange={e => setSkatt(parseFloat(e.target.value) || 0)}
                style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: "#f5a623", borderRadius: 10, padding: "10px 14px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
          </div>
        )}

        {/* Steg 4: Semester */}
        {steg === 3 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>🏖️</div>
            <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 28, textAlign: "center", marginBottom: 8 }}>Semesterersättning</div>
            <div style={{ color: "#5577aa", fontSize: 14, textAlign: "center", marginBottom: 28 }}>Hur hanteras din semester?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["månadsvis", "💰 Månadsvis +13%", "Semestertillägget betalas ut varje månad direkt på lönen — vanligast för timanställda"],
                ["dagar", "📅 Semesterdagar separat", "Du sparar semester och tar ut som lediga dagar med semesterlön"],
              ].map(([val, titel, desc]) => (
                <button key={val} onClick={() => setSemTyp(val)} style={{
                  padding: "18px 18px", borderRadius: 16, cursor: "pointer", textAlign: "left",
                  background: semTyp === val ? `${G}20` : NC,
                  border: `2px solid ${semTyp === val ? G : N}`,
                  fontFamily: "Outfit, sans-serif",
                }}>
                  <div style={{ color: semTyp === val ? G : "#fff", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{titel}</div>
                  <div style={{ color: "#5577aa", fontSize: 13, lineHeight: 1.5 }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Steg 5: Standardtider */}
        {steg === 4 && (
          <div style={{ animation: "fadeIn .3s ease" }}>
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>🕐</div>
            <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 28, textAlign: "center", marginBottom: 8 }}>Dina standardtider</div>
            <div style={{ color: "#5577aa", fontSize: 14, textAlign: "center", marginBottom: 24 }}>Fylls i automatiskt när du registrerar ett pass — går alltid att ändra</div>
            {Object.entries(DAG_META).map(([typ, meta]) => {
              const d = defaults[typ] ?? {};
              return (
                <div key={typ} style={{ background: NC, border: `1px solid ${N}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
                  <div style={{ color: meta.color, fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{meta.emoji} {meta.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[["Start", "start"], ["Slut", "end"]].map(([lbl, field]) => (
                      <div key={field}>
                        <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{lbl}</div>
                        <input type="time" value={minToHHMM(d[field] ?? (field === "start" ? 9*60+45 : 17*60))}
                          onChange={e => {
                            const [h, m] = e.target.value.split(":").map(Number);
                            setDefault(typ, field, h * 60 + m);
                          }}
                          style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 8, padding: "8px 10px", fontSize: 15, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, colorScheme: "dark" }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Knappar */}
      <div style={{ padding: "16px 20px 40px", background: N, display: "flex", gap: 10 }}>
        {steg > 0 && (
          <button onClick={() => setSteg(s => s - 1)} style={{
            flex: 1, padding: 14, background: "transparent", border: `1px solid ${N}`,
            borderRadius: 14, color: "#5577aa", fontWeight: 600, fontSize: 15,
            cursor: "pointer", fontFamily: "Outfit, sans-serif",
          }}>← Tillbaka</button>
        )}
        <button onClick={() => steg < totalSteg - 1 ? setSteg(s => s + 1) : spara()} style={{
          flex: 2, padding: 14,
          background: steg === totalSteg - 1 ? G : stegFärg[steg],
          border: "none", borderRadius: 14,
          color: "#001435", fontWeight: 700, fontSize: 16,
          cursor: "pointer", fontFamily: "Outfit, sans-serif",
        }}>
          {steg === totalSteg - 1 ? "✅ Klar — starta appen!" : "Nästa →"}
        </button>
      </div>
    </div>
  );
}
