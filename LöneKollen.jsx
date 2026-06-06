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

function loadSettings() {
  try { return { ...DEF_SETTINGS, ...JSON.parse(localStorage.getItem(STOR_S) || "{}") }; }
  catch { return { ...DEF_SETTINGS }; }
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
  const [stegeOpen, setStegeOpen]         = useState(false);
  const [bruttoOpen, setBruttoOpen]       = useState(false);

  // ── Gnistan-state ────────────────────────────────────────────────────────
  const [sparkTab, setSparkTab]       = useState("live");
  const [jobbläge, setJobbläge]       = useState("ledig");
  const [dagsmål, setDagsmål]         = useState(() => { try { return parseFloat(localStorage.getItem("lk-dagsmål")) || 10000; } catch { return 10000; } });
  const [passKvar, setPassKvar]       = useState(() => { try { return parseInt(localStorage.getItem("lk-passkvar")) || 5; } catch { return 5; } });

  useEffect(() => { try { localStorage.setItem("lk-dagsmål", dagsmål); } catch {} }, [dagsmål]);
  useEffect(() => { try { localStorage.setItem("lk-passkvar", passKvar); } catch {} }, [passKvar]);
  const [vadomTB, setVadomTB]         = useState("");
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

  function saveDay(day) {
    mutateDays(ds => {
      const idx = ds.findIndex(d => d.id === day.id);
      return idx >= 0 ? ds.map(d => d.id === day.id ? day : d) : [...ds, day];
    });
  }

  function deleteDay(id) { mutateDays(ds => ds.filter(d => d.id !== id)); }

  // ── Summering ────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const manual   = mData.manualTB;
    const kpiMål   = mData.kpiMål ?? [];
    let baseLön = 0, obLön = 0, skottTotal = 0, bonusTotal = 0;
    let totalTB = 0, säljDagar = 0;

    if (manual) {
      totalTB    = manual.totalTB   ?? 0;
      säljDagar  = manual.säljDagar ?? 0;
      skottTotal = manual.skott     ?? 0;
    } else {
      days.forEach(d => {
        const breakMin = getBreakMin(d.dagTyp);
        const normal = ((d.endMin - d.startMin) - breakMin) / 60 * settings.timlön;
        const total  = calcDayPay(d.dagTyp, d.startMin, d.endMin, settings.timlön);
        baseLön += normal;
        obLön   += (total - normal);
        if (d.passTyp === "annan") {
          skottTotal += (d.skott ?? 0);
        } else {
          totalTB  += (d.tb ?? 0);
          säljDagar++;
        }
        bonusTotal += (d.bonus ?? 0);
      });
    }

    const snittTB    = säljDagar > 0 ? totalTB / säljDagar : 0;
    const stege      = monthStege;
    const aktivStege = [...stege].reverse().find(s => snittTB >= s.snitt) ?? stege[0] ?? { procent: 0 };
    const nästaStege = stege.find(s => s.snitt > snittTB);

    // KPI-beräkning
    const säljPass = days.filter(d => d.passTyp !== "annan");
    const kpiResults = kpiMål.filter(k => k.aktiv !== false).map(kpi => {
      const vals  = säljPass.map(d => d.tjänster?.[kpi.id] ?? 0);
      const snitt = vals.length > 0 ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
      const nådd  = snitt >= kpi.mål;
      return { ...kpi, snitt, nådd };
    });
    const kpiProcent = kpiResults.filter(k => k.nådd).reduce((s,k) => s + k.procent, 0);
    const totalProcent = (aktivStege.procent + kpiProcent) / 100;
    const tbProv     = totalTB * totalProcent;
    const provTotal  = tbProv + skottTotal + bonusTotal;

    const brutto   = baseLön + obLön + provTotal;
    const netto    = brutto * (1 - settings.skatt / 100);
    const nettoSem = netto * 1.12;
    return { baseLön, obLön, tbProv, skottTotal, bonusTotal, provTotal, brutto, netto, nettoSem,
             totalTB, snittTB, säljDagar, aktivStege, nästaStege, isManual: !!manual,
             kpiResults, kpiProcent };
  }, [days, settings, monthStege, mData.manualTB, mData.kpiMål]);

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
              <button onClick={() => setAddOpen(true)} style={{
                background: G, border: "none", borderRadius: 12,
                color: "#001435", fontWeight: 700, fontSize: 22,
                width: 42, height: 42, cursor: "pointer", lineHeight: 1,
              }}>+</button>
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

            {/* Stege-banner om ingen stege är satt för månaden */}
            {!mData.tbStege && (
              <div style={{
                background: "#1a1000", border: "1px solid #f5a62355",
                borderRadius: 14, padding: "14px 16px", marginBottom: 14,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <div style={{ color: "#f5a623", fontWeight: 700, fontSize: 14 }}>⚠️ Ingen provisionsstege satt</div>
                  <div style={{ color: "#5577aa", fontSize: 12, marginTop: 3 }}>Sätt månadens stege för korrekt provisionsberäkning</div>
                </div>
                <button onClick={() => setStegeOpen(true)} style={{
                  background: "#f5a623", border: "none", borderRadius: 10,
                  color: "#001435", fontWeight: 700, fontSize: 13,
                  padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap",
                  fontFamily: "Outfit, sans-serif",
                }}>Sätt stege</button>
              </div>
            )}

            {mData.tbStege && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button onClick={() => setStegeOpen(true)} style={{
                  background: "transparent", border: `1px solid ${N}`,
                  borderRadius: 8, color: "#5577aa", fontSize: 12,
                  padding: "5px 12px", cursor: "pointer", fontFamily: "Outfit, sans-serif",
                }}>✏️ Ändra stege</button>
              </div>
            )}

            {/* ── HERO-KORT: Brutto · Netto · Semesterlön ── */}
            <div style={{ marginBottom: 14 }}>
              {/* Brutto — tryckbar för att se uppdelning */}
              <div
                onClick={() => setBruttoOpen(o => !o)}
                style={{
                  background: N, borderRadius: bruttoOpen ? "16px 16px 0 0" : 16,
                  padding: "18px 18px 14px", cursor: "pointer",
                  borderBottom: bruttoOpen ? `1px solid ${ND}` : "none",
                  transition: "border-radius .2s",
                }}
              >
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

              {/* Expanderad uppdelning */}
              {bruttoOpen && (
                <div style={{ background: NC, padding: "12px 18px", borderBottom: `1px solid ${ND}` }}>
                  {[
                    ["Baslön", summary.baseLön, null],
                    ["OB-tillägg", summary.obLön, null],
                    [`TB-provision (${summary.aktivStege?.procent ?? 0}%)`, summary.totalTB * (summary.aktivStege?.procent ?? 0) / 100, null],
                    ...(summary.kpiResults?.filter(k => k.nådd).map(k => [`✅ KPI: ${k.namn} (+${k.procent}%)`, summary.totalTB * k.procent / 100, G]) ?? []),
                    ...(summary.skottTotal > 0 ? [["Skottpengar", summary.skottTotal, null]] : []),
                    ...(summary.bonusTotal > 0 ? [["🏆 Tävlingsbonus", summary.bonusTotal, "#f5a623"]] : []),
                  ].map(([label, val, color], i, arr) => (
                    <div key={label} style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom: i < arr.length - 1 ? `1px solid ${N}` : "none",
                    }}>
                      <span style={{ color: "#6688bb", fontSize: 13 }}>{label}</span>
                      <span style={{ color: color ?? (val > 0 ? "#c8deff" : "#334"), fontWeight: 600, fontFamily: "Rajdhani, sans-serif", fontSize: 14 }}>{fmt(val)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Netto + Semesterlön */}
              <div style={{ display: "flex" }}>
                <div style={{
                  flex: 1, background: NC, padding: "14px 18px",
                  borderRadius: bruttoOpen ? "0 0 0 16px" : "0 0 0 16px",
                  borderRight: `1px solid ${ND}`,
                }}>
                  <div style={{ color: "#5577aa", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Netto ({settings.skatt}%)</div>
                  <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 22 }}>{fmt(summary.netto)}</div>
                </div>
                {settings.semesterLön && (
                  <div style={{
                    flex: 1, background: `${G}18`, padding: "14px 18px",
                    borderRadius: "0 0 16px 0",
                  }}>
                    <div style={{ color: "#5bc58877", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
                      {settings.semesterTyp === "månadsvis" ? "Ink. sem. +12%" : "Sem. intjänad"}
                    </div>
                    <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 22 }}>
                      {settings.semesterTyp === "månadsvis" ? fmt(summary.nettoSem) : fmt(summary.nettoSem - summary.netto)}
                    </div>
                  </div>
                )}
              </div>
            </div>

              {/* Netto + Semesterlön sida vid sida */}
              <div style={{ display: "flex" }}>
                <div style={{
                  flex: 1, background: NC, padding: "14px 18px",
                  borderRadius: "0 0 0 16px", borderRight: `1px solid ${ND}`,
                }}>
                  <div style={{ color: "#5577aa", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Netto ({settings.skatt}%)</div>
                  <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 22 }}>{fmt(summary.netto)}</div>
                </div>
                {settings.semesterLön && (
                  <div style={{
                    flex: 1, background: `${G}18`, padding: "14px 18px",
                    borderRadius: "0 0 16px 0",
                  }}>
                    <div style={{ color: "#5bc58877", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
                      {settings.semesterTyp === "månadsvis" ? "Ink. sem. +12%" : "Sem. intjänad"}
                    </div>
                    <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 22 }}>
                      {settings.semesterTyp === "månadsvis" ? fmt(summary.nettoSem) : fmt(summary.nettoSem - summary.netto)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pass-räknare */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {(summary.isManual ? [
                ["💼 Vardagar",  mData.manualDagar?.vardagar   ?? 0],
                ["🛒 Lördagar",  mData.manualDagar?.lördagar   ?? 0],
                ["☀️ Söndagar",  mData.manualDagar?.söndagar   ?? 0],
                ["🔴 Röda",      mData.manualDagar?.röda       ?? 0],
                ["🔧 Kassa",     mData.manualDagar?.kassaDagar ?? 0],
              ].filter(([,v]) => v > 0) : [
                ["📋 Pass",      days.length],
                ["💼 Vardagar",  days.filter(d => d.dagTyp === "vardag").length],
                ["🛒 Lördagar",  days.filter(d => d.dagTyp === "lördag").length],
                ["☀️ Söndagar",  days.filter(d => d.dagTyp === "söndag").length],
                ...(days.some(d => d.dagTyp === "röd") ? [["🔴 Röda", days.filter(d => d.dagTyp === "röd").length]] : []),
              ]).map(([label, val]) => (
                <div key={label} style={{
                  background: ND, border: `1px solid ${N}`, borderRadius: 8,
                  padding: "5px 10px", display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{ fontSize: 11 }}>{label.split(" ")[0]}</span>
                  <span style={{ color: "#5577aa", fontSize: 11 }}>{label.split(" ")[1]}</span>
                  <span style={{ color: val > 0 ? G : "#334", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 14 }}>{val}</span>
                </div>
              ))}
            </div>

            {/* TB-sektion */}
            {summary.säljDagar > 0 && (
              <div style={{ ...cardStyle, marginBottom: 14, border: `1px solid ${GD}` }}>
                <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>📊 TB & Provision</div>
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
                <div style={{ background: `${G}15`, border: `1px solid ${GD}`, borderRadius: 10, padding: "10px 14px", marginBottom: summary.nästaStege ? 8 : 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#5bc58899", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Aktiv serie</div>
                      <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20 }}>{summary.aktivStege.procent}% av TB</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#5577aa", fontSize: 10 }}>TB-provision</div>
                      <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 20 }}>{fmt(summary.tbProv)}</div>
                    </div>
                  </div>
                </div>
                {summary.nästaStege ? (() => {
                  const extraKr      = summary.totalTB * (summary.nästaStege.procent - summary.aktivStege.procent) / 100;
                  const extraNetto   = extraKr * (1 - settings.skatt / 100);
                  // Projicerat TB om resterande pass når nästa steges snitt
                  const projTB       = summary.totalTB + (passKvar * summary.nästaStege.snitt);
                  const projExtraKr  = projTB * (summary.nästaStege.procent - summary.aktivStege.procent) / 100;
                  const projExtraNetto = projExtraKr * (1 - settings.skatt / 100);
                  return (
                    <div style={{ marginTop: 10, background: "#0d1f00", border: "2px solid #f5a62366", borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ color: "#f5a62399", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                        💰 Om du når {summary.nästaStege.procent}%-serien
                      </div>

                      {/* På redan tjänad TB */}
                      <div style={{ color: "#5577aa", fontSize: 11, marginBottom: 6 }}>På redan tjänade {Math.round(summary.totalTB).toLocaleString("sv-SE")} kr TB</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "#0a0a00", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Brutto</div>
                          <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>+{fmt(extraKr)}</div>
                        </div>
                        <div style={{ background: "#0a0a00", borderRadius: 10, padding: "10px 12px" }}>
                          <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Netto ({settings.skatt}%)</div>
                          <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>+{fmt(extraNetto)}</div>
                        </div>
                      </div>

                      {/* Hela månaden inkl kvarvarande pass */}
                      {passKvar > 0 && (<>
                        <div style={{ borderTop: "1px solid #f5a62222", paddingTop: 10, marginBottom: 6 }}>
                          <div style={{ color: "#5577aa", fontSize: 11 }}>Hela månaden inkl {passKvar} pass kvar (snitt {summary.nästaStege.snitt.toLocaleString("sv-SE")} kr/pass)</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div style={{ background: "#0a0a00", borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Brutto</div>
                            <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>+{fmt(projExtraKr)}</div>
                          </div>
                          <div style={{ background: "#051a05", borderRadius: 10, padding: "10px 12px", border: `1px solid ${GD}` }}>
                            <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Netto ({settings.skatt}%)</div>
                            <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 20 }}>+{fmt(projExtraNetto)}</div>
                          </div>
                        </div>
                      </>)}

                      <div style={{ color: "#5577aa", fontSize: 11, textAlign: "center" }}>
                        Höj snittet med {Math.round(summary.nästaStege.snitt - summary.snittTB).toLocaleString("sv-SE")} kr/dag
                      </div>
                    </div>
                  );
                })() : summary.säljDagar > 0 && (
                  <div style={{ marginTop: 8, background: `${G}20`, border: `1px solid ${GD}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ color: G, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🏆 Högsta serien!</div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Ditt snitt</div>
                        <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>{Math.round(summary.snittTB).toLocaleString("sv-SE")} kr/dag</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Guldgräns</div>
                        <div style={{ color: "#5577aa", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>{(summary.aktivStege?.snitt ?? 0).toLocaleString("sv-SE")} kr/dag</div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Tillgodo / underskott */}
                {summary.säljDagar > 0 && (() => {
                  const goldSnitt   = summary.aktivStege?.snitt ?? 0;
                  const krävdTB     = goldSnitt * summary.säljDagar;
                  const tbTillgodo  = summary.totalTB - krävdTB;
                  const överskott   = tbTillgodo >= 0;
                  return (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* TB tillgodo */}
                      <div style={{
                        background: överskott ? `${G}15` : "#1a0000",
                        border: `1px solid ${överskott ? GD : "#aa2222"}`,
                        borderRadius: 10, padding: "10px 14px",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}>
                        <div>
                          <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>TB tillgodo på guldnivån</div>
                          <div style={{ color: "#5577aa", fontSize: 11 }}>{Math.round(summary.totalTB).toLocaleString("sv-SE")} − {Math.round(krävdTB).toLocaleString("sv-SE")} kr</div>
                        </div>
                        <div style={{ color: överskott ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 22 }}>
                          {överskott ? "+" : ""}{Math.round(tbTillgodo).toLocaleString("sv-SE")} kr
                        </div>
                      </div>

                      {/* KPI tillgodo */}
                      {summary.kpiResults?.filter(k => k.aktiv !== false).map(kpi => {
                        const kpiKrävda  = kpi.mål * summary.säljDagar;
                        const kpiTotalt  = kpi.snitt * summary.säljDagar;
                        const kpiDiff    = Math.round(kpiTotalt - kpiKrävda);
                        const kpiPlus    = kpiDiff >= 0;
                        return (
                          <div key={kpi.id} style={{
                            background: kpiPlus ? `${G}15` : "#1a0000",
                            border: `1px solid ${kpiPlus ? GD : "#aa2222"}`,
                            borderRadius: 10, padding: "10px 14px",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <div>
                              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{kpi.namn} tillgodo</div>
                              <div style={{ color: "#5577aa", fontSize: 11 }}>{kpiTotalt.toFixed(1)} / {kpiKrävda} st krävs</div>
                            </div>
                            <div style={{ color: kpiPlus ? G : "#ff6666", fontFamily: "Rajdhani, sans-serif", fontWeight: 800, fontSize: 22 }}>
                              {kpiPlus ? "+" : ""}{kpiDiff} st
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {/* KPI-status */}
                {summary.kpiResults?.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${N}` }}>
                    <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>KPI</div>
                    {summary.kpiResults.map(kpi => (
                      <div key={kpi.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div>
                          <span style={{ fontSize: 12 }}>{kpi.nådd ? "✅" : "⬜"}</span>
                          <span style={{ color: kpi.nådd ? "#fff" : "#5577aa", fontSize: 13, marginLeft: 6 }}>{kpi.namn}</span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ color: kpi.nådd ? G : "#5577aa", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 13 }}>
                            {kpi.snitt.toFixed(1)}/{kpi.mål} st
                          </span>
                          <span style={{ color: kpi.nådd ? G : "#334", fontSize: 11, marginLeft: 6 }}>+{kpi.procent}%</span>
                        </div>
                      </div>
                    ))}
                    {summary.kpiProcent > 0 && (
                      <div style={{ background: `${G}15`, borderRadius: 8, padding: "6px 10px", marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#5577aa", fontSize: 12 }}>Total provision inkl KPI</span>
                        <span style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}>{summary.aktivStege?.procent + summary.kpiProcent}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              {days.length} pass registrerade
            </div>

            {days.length === 0 && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "32px 20px", color: "#334" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
                <div style={{ color: "#4466aa", fontSize: 14 }}>Tryck + för att lägga till ditt första pass</div>
              </div>
            )}

            {[...days].sort((a, b) => a.startMin - b.startMin).map(day => {
              const meta     = DAG_META[day.dagTyp];
              const breakMin = getBreakMin(day.dagTyp);
              const pay      = calcDayPay(day.dagTyp, day.startMin, day.endMin, settings.timlön);
              const basePay  = ((day.endMin - day.startMin) - breakMin) / 60 * settings.timlön;
              const prov     = day.provision ?? settings.prov_default;
              const total    = pay + prov;
              const h        = (day.endMin - day.startMin) / 60;

              return (
                <div key={day.id} style={{
                  ...cardStyle, marginBottom: 10,
                  borderLeft: `4px solid ${meta.color}`,
                  animation: "slideUp .2s ease",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{meta.label}</div>
                        <div style={{ color: "#5577aa", fontSize: 12 }}>
                          {minToHHMM(day.startMin)} – {minToHHMM(day.endMin)} &nbsp;·&nbsp; {h.toFixed(2).replace(".", ",")}h
                          {breakMin > 0 && <span style={{ color: "#445" }}> &nbsp;·&nbsp; {breakMin}min rast</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: G, fontWeight: 700, fontFamily: "Rajdhani, sans-serif", fontSize: 18 }}>{fmt(pay)}</div>
                      {day.passTyp === "annan"
                        ? <div style={{ color: "#f5a623", fontSize: 11 }}>skott {fmt(day.skott ?? 0)}</div>
                        : day.tb > 0
                          ? <div style={{ color: "#5577aa", fontSize: 11 }}>TB {Math.round(day.tb).toLocaleString("sv-SE")} kr{day.bonus > 0 ? ` · 🏆 +${day.bonus}` : ""}</div>
                          : null
                      }
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={() => { setEditId(day.id); setAddOpen(true); }} style={{
                      flex: 1, padding: "7px 0", background: "transparent",
                      border: `1px solid ${N}`, borderRadius: 8, color: "#6688bb",
                      cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif",
                    }}>Redigera</button>
                    <button onClick={() => deleteDay(day.id)} style={{
                      padding: "7px 14px", background: "transparent",
                      border: "1px solid #440000", borderRadius: 8, color: "#884444",
                      cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif",
                    }}>✕</button>
                  </div>
                </div>
              );
            })}
          </>)}

          {/* ════════════════ GNISTAN ════════════════ */}
          {tab === "gnistan" && (() => {
            // ── Gemensamma beräkningar ───────────────────────────────────
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

            // ── TB-provision beräkning ───────────────────────────────────
            const todayTB       = parseFloat(sparkTB) || 0;
            const säljDays      = days.filter(d => d.passTyp !== "annan");
            const befintligTB   = säljDays.reduce((s,d) => s + (d.tb ?? 0), 0);
            const nyTotalTB     = befintligTB + todayTB;
            const nySäljDagar   = säljDays.length + (todayTB > 0 ? 1 : 0);
            const nySnitt       = nySäljDagar > 0 ? nyTotalTB / nySäljDagar : 0;
            const stege         = monthStege;
            const aktivTier     = [...stege].reverse().find(s => nySnitt >= s.snitt) ?? stege[0] ?? { procent: 0 };
            const nästaStegeTB  = stege.find(s => s.snitt > nySnitt);
            const nyProv        = nyTotalTB * (aktivTier.procent / 100);
            const gammalSnitt   = säljDays.length > 0 ? befintligTB / säljDays.length : 0;
            const gammalTier    = [...stege].reverse().find(s => gammalSnitt >= s.snitt) ?? stege[0] ?? { procent: 0 };
            const gammalProv    = befintligTB * (gammalTier.procent / 100);
            const tbBidrag      = nyProv - gammalProv;

            // ── Tempo & mål-beräkningar ──────────────────────────────────
            const curTotalTB    = summary.totalTB;
            const curSäljDagar  = summary.säljDagar;
            const curSnitt      = summary.snittTB;
            const nästaStege_   = summary.nästaStege;
            const aktivStege_   = summary.aktivStege;

            // Vad behövs per pass för nästa stege?
            const totalPassKvar = Math.max(1, passKvar);
            const neededSnittNästa = nästaStege_?.snitt ?? 0;
            const neededTBNästa  = Math.max(0, neededSnittNästa * (curSäljDagar + totalPassKvar) - curTotalTB);
            const neededPerPassNästa = neededTBNästa / totalPassKvar;

            // Hur mycket kan snittet sjunka? (buffert till nedre stege)
            const lowerStege    = [...stege].reverse().find(s => s.snitt < aktivStege_?.snitt);
            const bufferPerPass = lowerStege
              ? ((curSnitt - lowerStege.snitt) * curSäljDagar) / Math.max(1, curSäljDagar)
              : null;

            // Bästa pass
            const bestPass      = [...säljDays].sort((a,b) => (b.tb??0) - (a.tb??0))[0];

            // Streak — antal pass i rad från slutet med TB >= dagsmål
            const sortedPasses  = [...säljDays];
            let streak = 0;
            for (let i = sortedPasses.length - 1; i >= 0; i--) {
              if ((sortedPasses[i].tb ?? 0) >= dagsmål) streak++;
              else break;
            }
            const passedGoal    = säljDays.filter(d => (d.tb ?? 0) >= dagsmål).length;

            // Vad om... scenario
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
              ["tempo","📊 Tempo"],
              ["vadom","💰 Vad om"],
              ["stats","🏆 Stats"],
              ["fakta","🧠 Fakta"],
            ];

            return (
              <div>
                {/* Sub-tab bar */}
                <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
                  {subTabs.map(([key, label]) => (
                    <button key={key} onClick={() => setSparkTab(key)} style={{
                      flexShrink: 0, padding: "7px 12px", border: "none", borderRadius: 20,
                      background: sparkTab === key ? "#f5a623" : NC,
                      color: sparkTab === key ? "#001435" : "#5577aa",
                      fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "Outfit, sans-serif",
                      whiteSpace: "nowrap",
                    }}>{label}</button>
                  ))}
                </div>

                {/* ── LIVE ── */}
                {sparkTab === "live" && (
                  <div>
                    {/* Ledig / På jobbet toggle */}
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
                          {/* Medal + serie-kort */}
                          <div style={{ background: medal.bg, border:`2px solid ${medal.color}44`, borderRadius:20, padding:"24px 20px", marginBottom:14, textAlign:"center" }}>
                            <div style={{ fontSize:52, marginBottom:8 }}>{medal.emoji}</div>
                            <div style={{ color: medal.color, fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:28, letterSpacing:1 }}>{medal.label}-serie</div>
                            <div style={{ color: medal.color, fontSize:32, fontFamily:"Rajdhani, sans-serif", fontWeight:700, marginTop:4 }}>{aktivStege_?.procent ?? 0}% provision</div>
                            <div style={{ color:"#5577aa", fontSize:13, marginTop:8 }}>på {curSäljDagar} säljdagar · snitt {Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag</div>
                          </div>

                          {/* Nästa stege */}
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

                          {/* Total TB & provision */}
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
                        {/* Pass-inställningar */}
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

                        {/* TB för dagen */}
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

                        {/* Live-räknare */}
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

                        {/* Gå hem tidigt */}
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
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>🎯 Pass kvar denna månad</div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0, marginBottom:16 }}>
                        <button onClick={() => setPassKvar(p => Math.max(1,p-1))} style={{ width:44, height:44, borderRadius:"12px 0 0 12px", background:G, border:"none", color:"#001435", fontSize:22, fontWeight:900, cursor:"pointer" }}>−</button>
                        <div style={{ width:80, height:44, background:ND, display:"flex", alignItems:"center", justifyContent:"center", border:`1px solid ${N}`, borderLeft:"none", borderRight:"none", color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:24 }}>{passKvar}</div>
                        <button onClick={() => setPassKvar(p => p+1)} style={{ width:44, height:44, borderRadius:"0 12px 12px 0", background:G, border:"none", color:"#001435", fontSize:22, fontWeight:900, cursor:"pointer" }}>+</button>
                      </div>

                      {nästaStege_ ? (<>
                        <div style={{ background:`${G}15`, border:`1px solid ${GD}`, borderRadius:12, padding:"16px", marginBottom:12, textAlign:"center" }}>
                          <div style={{ color:"#5bc58899", fontSize:11, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Du behöver i snitt per pass</div>
                          <div style={{ color:G, fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:36 }}>{Math.ceil(neededPerPassNästa).toLocaleString("sv-SE")} kr</div>
                          <div style={{ color:"#5577aa", fontSize:12, marginTop:4 }}>TB för att nå {nästaStege_.procent}%-serien</div>
                        </div>

                        {/* Extra i fickan */}
                        {curTotalTB > 0 && (() => {
                          const extraKr      = curTotalTB * (nästaStege_.procent - aktivStege_.procent) / 100;
                          const extraNetto   = extraKr * (1 - settings.skatt / 100);
                          const projTB       = curTotalTB + (passKvar * nästaStege_.snitt);
                          const projExtraKr  = projTB * (nästaStege_.procent - aktivStege_.procent) / 100;
                          const projExtraNetto = projExtraKr * (1 - settings.skatt / 100);
                          return (
                            <div style={{ background:"#0d1f00", border:"2px solid #f5a62366", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                              <div style={{ color:"#f5a62399", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>💰 Värt att kämpa för</div>

                              <div style={{ color:"#5577aa", fontSize:11, marginBottom:6 }}>På redan tjänade {Math.round(curTotalTB).toLocaleString("sv-SE")} kr TB</div>
                              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
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
                                <div style={{ borderTop:"1px solid #f5a62222", paddingTop:10, marginBottom:6 }}>
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

                        {/* Progress bar mot nästa stege */}
                        <div style={{ marginBottom:8 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                            <span style={{ color:"#5577aa", fontSize:11 }}>Nuläge: {Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag</span>
                            <span style={{ color:"#5577aa", fontSize:11 }}>Mål: {nästaStege_.snitt.toLocaleString("sv-SE")} kr/dag</span>
                          </div>
                          <div style={{ height:10, background:ND, borderRadius:5, overflow:"hidden" }}>
                            <div style={{ height:"100%", borderRadius:5, background:`linear-gradient(90deg,${G},#f5a623)`, width:`${Math.min(100,(curSnitt/nästaStege_.snitt)*100)}%`, transition:"width .4s" }} />
                          </div>
                          <div style={{ color:G, fontSize:12, textAlign:"center", marginTop:6, fontWeight:700 }}>
                            {Math.round((curSnitt/nästaStege_.snitt)*100)}% av vägen dit
                          </div>
                        </div>
                      </>) : (
                        <div style={{ background:`${G}20`, border:`1px solid ${GD}`, borderRadius:12, padding:"20px", textAlign:"center" }}>
                          <div style={{ fontSize:32, marginBottom:8 }}>🏆</div>
                          <div style={{ color:G, fontWeight:700, fontSize:18, marginBottom:6 }}>Högsta serien!</div>
                          <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}><span style={{ color:"#5577aa", fontSize:12 }}>Snitt: {Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag</span><span style={{ color:"#5577aa", fontSize:12 }}>Gräns: {(aktivStege_?.snitt ?? 0).toLocaleString("sv-SE")} kr/dag</span></div>
                        </div>
                      )}
                    </div>

                    {/* Dagsmål */}
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px" }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>🔥 Ditt dagsmål i TB (kr)</div>
                      <input type="number" value={dagsmål} step={1000} min={0}
                        onChange={e => setDagsmål(parseFloat(e.target.value)||0)}
                        style={{ width:"100%", background:ND, border:`1px solid #f5a62355`, color:"#f5a623", borderRadius:10, padding:"12px 16px", fontSize:20, fontFamily:"Rajdhani, sans-serif", fontWeight:700 }}
                      />
                      <div style={{ color:"#5577aa", fontSize:12, marginTop:8 }}>Används för streak-räknaren</div>
                    </div>
                  </div>
                )}

                {/* ── TEMPO ── */}
                {sparkTab === "tempo" && (
                  <div>
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:14 }}>📊 Tempo just nu</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                        {[
                          ["Säljdagar", curSäljDagar],
                          ["Snitt TB/dag", Math.round(curSnitt).toLocaleString("sv-SE") + " kr"],
                          ["Total TB", Math.round(curTotalTB).toLocaleString("sv-SE") + " kr"],
                          ["Aktiv serie", (aktivStege_?.procent ?? 0) + "%"],
                        ].map(([label, val]) => (
                          <div key={label} style={{ background:ND, borderRadius:10, padding:"12px 14px" }}>
                            <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1 }}>{label}</div>
                            <div style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:18, marginTop:4 }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {nästaStege_ ? (<>
                        <div style={{ color:"#5577aa", fontSize:12, marginBottom:6 }}>Behöver {Math.round(neededPerPassNästa).toLocaleString("sv-SE")} kr/pass i snitt ({passKvar} pass kvar) för {nästaStege_.procent}%</div>
                        <div style={{ height:10, background:ND, borderRadius:5, overflow:"hidden", marginBottom:8 }}>
                          <div style={{ height:"100%", borderRadius:5, background:`linear-gradient(90deg,${G},#f5a623)`, width:`${Math.min(100,(curSnitt/nästaStege_.snitt)*100)}%` }} />
                        </div>
                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                          <span style={{ color:"#5577aa", fontSize:11 }}>{Math.round(curSnitt).toLocaleString("sv-SE")}</span>
                          <span style={{ color:G, fontSize:11, fontWeight:700 }}>{Math.round((curSnitt/nästaStege_.snitt)*100)}%</span>
                          <span style={{ color:"#5577aa", fontSize:11 }}>{nästaStege_.snitt.toLocaleString("sv-SE")}</span>
                        </div>
                      </>) : (
                        <div style={{ background:`${G}20`, border:`1px solid ${GD}`, borderRadius:10, padding:"14px", textAlign:"center" }}>
                          <div style={{ color:G, fontWeight:700, fontSize:16 }}>🏆 Du är på toppnivå!</div>
                          <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}><span style={{ color:"#5577aa", fontSize:12 }}>Snitt: {Math.round(curSnitt).toLocaleString("sv-SE")} kr/dag</span><span style={{ color:"#5577aa", fontSize:12 }}>Gräns: {(aktivStege_?.snitt ?? 0).toLocaleString("sv-SE")} kr/dag</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── VAD OM ── */}
                {sparkTab === "vadom" && (
                  <div>
                    <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px", marginBottom:14 }}>
                      <div style={{ color:"#f5a623", fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>💰 Simulera ett pass</div>
                      <div style={{ color:"#5577aa", fontSize:12, marginBottom:12 }}>Vad händer med din provision om du gör X kr i TB?</div>
                      <input type="number" value={vadomTB} step={1000} min={0} placeholder="Ange TB för passet..."
                        onChange={e => setVadomTB(e.target.value)}
                        style={{ width:"100%", background:ND, border:`1px solid ${N}`, color:G, borderRadius:10, padding:"12px 16px", fontSize:20, fontFamily:"Rajdhani, sans-serif", fontWeight:700, marginBottom: vadomVal > 0 ? 14 : 0 }}
                      />
                      {vadomVal > 0 && (<>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                          <div style={{ background:ND, borderRadius:10, padding:"12px 14px" }}>
                            <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1 }}>Nytt snitt</div>
                            <div style={{ color:"#fff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:18 }}>{Math.round(vadomSnitt).toLocaleString("sv-SE")} kr</div>
                          </div>
                          <div style={{ background:ND, borderRadius:10, padding:"12px 14px" }}>
                            <div style={{ color:"#5577aa", fontSize:10, textTransform:"uppercase", letterSpacing:1 }}>Serie</div>
                            <div style={{ color: tierChanged ? "#f5a623" : G, fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:18 }}>{vadomTier.procent}% {tierChanged ? "🆙" : ""}</div>
                          </div>
                        </div>
                        <div style={{ background: vadomDelta > 0 ? `${G}15` : "#2a0808", border:`1px solid ${vadomDelta > 0 ? GD : "#aa2222"}`, borderRadius:12, padding:"14px 16px", textAlign:"center" }}>
                          <div style={{ color:"#5577aa", fontSize:11, marginBottom:4 }}>Provisionspåverkan</div>
                          <div style={{ color: vadomDelta >= 0 ? G : "#ff6666", fontFamily:"Rajdhani, sans-serif", fontWeight:800, fontSize:30 }}>
                            {vadomDelta >= 0 ? "+" : ""}{fmt(vadomDelta)}
                          </div>
                          {tierChanged && <div style={{ color:"#f5a623", fontSize:12, marginTop:4 }}>🆙 Du byter till {vadomTier.procent}%-serien!</div>}
                        </div>
                      </>)}
                    </div>
                  </div>
                )}

                {/* ── STATS ── */}
                {sparkTab === "stats" && (
                  <div>
                    {/* Bästa pass */}
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

                    {/* Streak */}
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
                {sparkTab === "fakta" && (
                  <div style={{ background: NC, border:`1px solid ${N}`, borderRadius:16, padding:"16px 18px" }}>
                    <div style={{ color:G, fontSize:11, fontWeight:600, letterSpacing:2, textTransform:"uppercase", marginBottom:12 }}>🧠 Snabbfakta</div>
                    {[
                      ["Per minut (netto)", `${krPerMinNetto.toFixed(2)} kr`],
                      ["Per timme (netto)", fmt(krPerMinNetto*60)],
                      ["Per timme (brutto)", fmt(krPerMin*60)],
                      ["En kaffe (32 kr)", `${Math.ceil(32/krPerMinNetto)} min jobb`],
                      ["En lunch (120 kr)", `${Math.ceil(120/krPerMinNetto)} min jobb`],
                      ["Hela passet netto", fmt(fullNetto)],
                      ["Hela passet brutto", fmt(fullPay)],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${N}` }}>
                        <span style={{ color:"#5577aa", fontSize:13 }}>{label}</span>
                        <span style={{ color:"#c8deff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:14 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
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
                {/* Bar */}
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
            <SettingsPanel settings={settings} setSettings={setSettings} />
          )}
        </div>
      </div>

      {/* ════════════════ LÄGG TILL/REDIGERA-MODAL ════════════════ */}
      {stegeOpen && (
        <StegeModal
          initialStege={mData.tbStege ?? settings.tbStege ?? []}
          initialKPI={mData.kpiMål ?? []}
          initialBonus={mData.bonusAktiv ?? false}
          month={month}
          onSave={(stege, kpiMål, bonusAktiv) => {
            saveMonthStege(stege);
            saveMonthKPI(kpiMål);
            mutateMonth(cur => ({ ...cur, bonusAktiv }));
            setStegeOpen(false);
          }}
          onCancel={() => setStegeOpen(false)}
        />
      )}

      {addOpen && (
        <DayForm
          settings={settings}
          kpiMål={mData.kpiMål ?? []}
          bonusAktiv={mData.bonusAktiv ?? false}
          initialDay={editId ? days.find(d => d.id === editId) : null}
          onSave={day => { saveDay(day); setAddOpen(false); setEditId(null); }}
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

// ─── Stege-modal ──────────────────────────────────────────────────────────
function StegeModal({ initialStege, initialKPI, initialBonus, month, onSave, onCancel }) {
  const [stege, setStege]       = useState(initialStege.length > 0 ? initialStege : [{ snitt: 0, procent: 3 }]);
  const [kpiMål, setKpiMål]     = useState(initialKPI ?? []);
  const [bonusAktiv, setBonusAktiv] = useState(initialBonus ?? false);

  function updateSteg(i, field, val) {
    setStege(prev => prev.map((s, j) => j === i ? { ...s, [field]: parseFloat(val) || 0 } : s));
  }
  function updateKPI(id, field, val) {
    setKpiMål(prev => prev.map(k => k.id === id ? { ...k, [field]: field === "procent" || field === "mål" ? parseFloat(val) || 0 : val } : k));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
      <div style={{
        width: "100%", background: "#001a50", borderRadius: "24px 24px 0 0",
        padding: "20px 18px 40px", animation: "slideUp .25s ease",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Provisionsstege & KPI</div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: "#5577aa", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 20, textTransform: "capitalize" }}>
          {new Date(month + "-01").toLocaleString("sv-SE", { month: "long", year: "numeric" })}
        </div>

        {/* TB-stege */}
        <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>TB-stege</div>
        {stege.map((s, i) => (
          <div key={i} style={{ background: NC, border: `1px solid ${N}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Snitt från (kr/dag)</div>
              <input type="number" value={s.snitt} min={0} step={500}
                onChange={e => updateSteg(i, "snitt", e.target.value)}
                style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 8, padding: "10px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>TB-procent (%)</div>
              <input type="number" value={s.procent} min={0} step={0.5}
                onChange={e => updateSteg(i, "procent", e.target.value)}
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

        {/* KPI */}
        <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>KPI-provision</div>
        <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 12 }}>Varje uppnådd KPI adderar sin procent till TB-provisionen.</div>
        {kpiMål.map(kpi => (
          <div key={kpi.id} style={{ background: NC, border: `1px solid ${kpi.aktiv !== false ? "#f5a62344" : N}`, borderRadius: 12, padding: "14px", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <input value={kpi.namn} placeholder="Namn (t.ex. Kalibrering)"
                onChange={e => updateKPI(kpi.id, "namn", e.target.value)}
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
                <input type="number" value={kpi.mål} min={0} step={0.5}
                  onChange={e => updateKPI(kpi.id, "mål", e.target.value)}
                  style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: "#f5a623", borderRadius: 8, padding: "8px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                />
              </div>
              <div>
                <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Extra provision (%)</div>
                <input type="number" value={kpi.procent} min={0} step={0.5}
                  onChange={e => updateKPI(kpi.id, "procent", e.target.value)}
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

        {/* Tävlingsbonus */}
        <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Tävlingsbonus</div>
        <div style={{ background: NC, border: `1px solid ${bonusAktiv ? "#f5a62344" : N}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
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

        <button onClick={() => onSave(stege, kpiMål, bonusAktiv)} style={{
          width: "100%", padding: 16, background: G, border: "none",
          borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
          cursor: "pointer", fontFamily: "Outfit, sans-serif",
        }}>Spara</button>
      </div>
    </div>
  );
}

// ─── Dag-formulär ─────────────────────────────────────────────────────────
function DayForm({ settings, initialDay, onSave, onSaveMonth, onSaveDefault, onCancel, kpiMål, bonusAktiv }) {
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
  const [tjänster, setTjänster]   = useState(initialDay?.tjänster ?? {});
  const [bonus, setBonus]         = useState(initialDay?.bonus ?? 0);
  const [savedDefault, setSavedDefault] = useState(false);

  // ── Hel-månad state ──────────────────────────────────────────────────────
  const [mVardagar, setMVardagar]   = useState(0);
  const [mLördagar, setMLördagar]   = useState(0);
  const [mSöndagar, setMSöndagar]   = useState(0);
  const [mRöda, setMRöda]           = useState(0);
  const [mKassa, setMKassa]         = useState(0);
  const [mTotalTB, setMTotalTB]     = useState("");
  const [mSnittSkott, setMSnittSkott] = useState("");

  // Uppdatera default tider vid byte av dagtyp
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

        {/* Flikar — dölj vid redigering */}
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

          // Beräkna timlön för månaden
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

              {/* Förhandsvisning */}
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

        {/* Tider */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <TimeControl label="Starttid" value={startMin} onChange={setStartMin} />
          <TimeControl label="Sluttid"  value={endMin}   onChange={setEndMin}   />
        </div>

        {/* Passtyp */}
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
          {/* TB */}
          <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>TB (kr)</div>
          <input
            type="number" value={tb} step={500} min={0}
            onChange={e => setTb(parseFloat(e.target.value) || "")}
            placeholder="0"
            style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, marginBottom: activeKPIs.length > 0 ? 14 : 20 }}
          />

          {/* KPI-fält per pass */}
          {activeKPIs.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Tjänster</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {activeKPIs.map(kpi => (
                  <div key={kpi.id}>
                    <div style={{ color: "#5577aa", fontSize: 11, marginBottom: 4 }}>{kpi.namn || "KPI"} (mål: {kpi.mål})</div>
                    <input type="number" min={0} step={1}
                      value={tjänster[kpi.id] ?? ""}
                      placeholder="0"
                      onChange={e => setTjänster(prev => ({ ...prev, [kpi.id]: parseFloat(e.target.value) || 0 }))}
                      style={{ width: "100%", background: ND, border: `1px solid #f5a62344`, color: "#f5a623", borderRadius: 8, padding: "10px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>) : (<>
          {/* Skottpengar */}
          <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Skottpengar (kr)</div>
          <input
            type="number" value={skott} step={100} min={0}
            onChange={e => setSkott(parseFloat(e.target.value) || "")}
            placeholder="0"
            style={{ width: "100%", background: ND, border: `1px solid #f5a62355`, color: "#f5a623", borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, marginBottom: 20 }}
          />
        </>)}

        {/* Förhandsvisning */}
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

          {/* Tävlingsbonus — visas bara om aktiv denna månad */}
          {bonusAktiv && (
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
        })} style={{
          width: "100%", padding: 16, background: G, border: "none",
          borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
          cursor: "pointer", fontFamily: "Outfit, sans-serif",
        }}>
          {initialDay ? "Spara ändringar" : "Lägg till pass"}
        </button>
        </>)}
      </div>
    </div>
  );
}

// ─── Inställningar ────────────────────────────────────────────────────────
function SettingsPanel({ settings, setSettings }) {
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
          <span style={{ color: "#c8deff", fontSize: 14 }}>Visa semesterlön (+12%)</span>
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
    </div>
  );
}
