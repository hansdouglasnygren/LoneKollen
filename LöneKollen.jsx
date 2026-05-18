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
  const [stegeOpen, setStegeOpen] = useState(false);

  // ── Gnistan-state ────────────────────────────────────────────────────────
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

  function saveDay(day) {
    mutateDays(ds => {
      const idx = ds.findIndex(d => d.id === day.id);
      return idx >= 0 ? ds.map(d => d.id === day.id ? day : d) : [...ds, day];
    });
  }

  function deleteDay(id) { mutateDays(ds => ds.filter(d => d.id !== id)); }

  // ── Summering ────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let baseLön = 0, obLön = 0, skottTotal = 0;
    let totalTB = 0, säljDagar = 0;

    days.forEach(d => {
      const breakMin = getBreakMin(d.dagTyp);
      const normal = ((d.endMin - d.startMin) - breakMin) / 60 * settings.timlön;
      const total  = calcDayPay(d.dagTyp, d.startMin, d.endMin, settings.timlön);
      baseLön += normal;
      obLön   += (total - normal);

      if (d.passTyp === "annan") {
        skottTotal += (d.skott ?? 0);
      } else {
        // säljdag (default för gamla pass)
        totalTB  += (d.tb ?? 0);
        säljDagar++;
      }
    });

    const snittTB    = säljDagar > 0 ? totalTB / säljDagar : 0;
    const stege      = monthStege;
    const aktivStege = [...stege].reverse().find(s => snittTB >= s.snitt) ?? stege[0] ?? { procent: 0 };
    const nästaStege = stege.find(s => s.snitt > snittTB);
    const tbProv     = totalTB * (aktivStege.procent / 100);
    const provTotal  = tbProv + skottTotal;

    const brutto   = baseLön + obLön + provTotal;
    const netto    = brutto * (1 - settings.skatt / 100);
    const nettoSem = netto * 1.12;
    return { baseLön, obLön, tbProv, skottTotal, provTotal, brutto, netto, nettoSem,
             totalTB, snittTB, säljDagar, aktivStege, nästaStege };
  }, [days, settings]);

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

            {/* Summering */}
            <div style={{ ...cardStyle, marginBottom: 14 }}>
              {/* Pass-räknare */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {[
                  ["📋 Pass", days.length],
                  ["💼 Vardagar", days.filter(d => d.dagTyp === "vardag").length],
                  ["🛒 Lördagar", days.filter(d => d.dagTyp === "lördag").length],
                  ["☀️ Söndagar", days.filter(d => d.dagTyp === "söndag").length],
                  ...(days.some(d => d.dagTyp === "röd") ? [["🔴 Röda", days.filter(d => d.dagTyp === "röd").length]] : []),
                ].map(([label, val]) => (
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
              <div style={{ borderTop: `1px solid ${N}`, paddingTop: 12, display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Brutto</div>
                  <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: "Rajdhani, sans-serif" }}>{fmt(summary.brutto)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#5577aa", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Netto ({settings.skatt}%)</div>
                  <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: "Rajdhani, sans-serif" }}>{fmt(summary.netto)}</div>
                </div>
              </div>
              {settings.semesterLön && settings.semesterTyp === "månadsvis" && (
                <div style={{ background: `${G}18`, border: `1px solid ${GD}`, borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: "#5bc58855", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Ink. semesterlön +12% (månadsvis)</div>
                  <div style={{ color: G, fontSize: 24, fontWeight: 700, fontFamily: "Rajdhani, sans-serif", marginTop: 2 }}>{fmt(summary.nettoSem)}</div>
                </div>
              )}
              {settings.semesterLön && settings.semesterTyp === "dagar" && (
                <div style={{ background: "#f5a62318", border: "1px solid #f5a62355", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ color: "#f5a62399", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Semesterlön intjänad (+12%)</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ color: "#f5a623", fontSize: 20, fontWeight: 700, fontFamily: "Rajdhani, sans-serif" }}>{fmt(summary.nettoSem - summary.netto)}</div>
                      <div style={{ color: "#f5a62399", fontSize: 11, marginTop: 2 }}>betalas ut vid semesteruttag</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#5577aa", fontSize: 11 }}>Utbetalt nu</div>
                      <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, fontFamily: "Rajdhani, sans-serif" }}>{fmt(summary.netto)}</div>
                    </div>
                  </div>
                </div>
              )}
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
                {summary.nästaStege ? (
                  <div style={{ color: "#5577aa", fontSize: 12, textAlign: "center", marginTop: 6 }}>
                    {(summary.nästaStege.snitt - summary.snittTB).toLocaleString("sv-SE")} kr/dag till {summary.nästaStege.procent}%-serien
                  </div>
                ) : summary.säljDagar > 0 && (
                  <div style={{ marginTop: 8, background: `${G}20`, borderRadius: 8, padding: "8px 12px", textAlign: "center" }}>
                    <div style={{ color: G, fontSize: 12, fontWeight: 700 }}>🏆 Högsta serien!</div>
                    <div style={{ color: "#5577aa", fontSize: 12, marginTop: 2 }}>
                      {(summary.snittTB - ((settings.tbStege ?? [])[( settings.tbStege ?? []).length - 2]?.snitt ?? 0)).toLocaleString("sv-SE")} kr/dag buffert kvar
                    </div>
                  </div>
                )}
                {summary.skottTotal > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${N}` }}>
                    <span style={{ color: "#5577aa", fontSize: 13 }}>Skottpengar</span>
                    <span style={{ color: "#c8deff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 14 }}>{fmt(summary.skottTotal)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Uppdelning */}
            <div style={{ ...cardStyle, marginBottom: 18 }}>
              {[
                ["Baslön", summary.baseLön],
                ["OB-tillägg", summary.obLön],
                ["TB-provision", summary.tbProv],
                ...(summary.skottTotal > 0 ? [["Skottpengar", summary.skottTotal]] : []),
              ].map(([label, val], i, arr) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0",
                  borderBottom: i < arr.length - 1 ? `1px solid ${N}` : "none",
                }}>
                  <span style={{ color: "#6688bb", fontSize: 13 }}>{label}</span>
                  <span style={{ color: val > 0 ? "#c8deff" : "#334", fontWeight: 600, fontFamily: "Rajdhani, sans-serif", fontSize: 15 }}>{fmt(val)}</span>
                </div>
              ))}
            </div>

          {/* Flytta pass-knapp */}
            {days.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <button onClick={() => {
                  const target = addMonths(month, -1);
                  if (!window.confirm(`Flytta alla ${days.length} pass från ${fmtMonth(month)} till ${fmtMonth(target)}?`)) return;
                  setMonths(prev => {
                    const curDays = prev[month]?.days ?? [];
                    const curStege = prev[month]?.tbStege;
                    const targetExisting = prev[target] ?? { days: [] };
                    return {
                      ...prev,
                      [target]: {
                        ...targetExisting,
                        days: [...(targetExisting.days ?? []), ...curDays],
                        ...(curStege && !targetExisting.tbStege ? { tbStege: curStege } : {}),
                      },
                      [month]: { days: [] },
                    };
                  });
                  setMonth(target);
                }} style={{
                  width: "100%", padding: "11px 0",
                  background: "transparent", border: "1px solid #334",
                  borderRadius: 12, color: "#5577aa", cursor: "pointer",
                  fontSize: 13, fontFamily: "Outfit, sans-serif",
                }}>
                  ↩ Flytta alla pass till {fmtMonth(addMonths(month, -1))}
                </button>
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
                          ? <div style={{ color: "#5577aa", fontSize: 11 }}>TB {Math.round(day.tb).toLocaleString("sv-SE")} kr</div>
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
            const sparkBreak  = getBreakMin(sparkDagTyp);
            const clampedNow  = Math.min(Math.max(nowMin, sparkStart), sparkEnd);
            const elapsed     = Math.max(0, clampedNow - sparkStart);
            const totalMin    = Math.max(1, sparkEnd - sparkStart);
            const remaining   = Math.max(0, sparkEnd - clampedNow);
            const progress    = sparkEnd > sparkStart ? elapsed / totalMin : 0;
            const provSoFar   = sparkProv * (elapsed / totalMin);
            const earnedSoFar = calcShiftPay(sparkDagTyp, sparkStart, Math.max(sparkStart, clampedNow - sparkBreak * (elapsed/totalMin)), settings.timlön) + provSoFar;
            const earnedNetto = earnedSoFar * (1 - settings.skatt / 100);
            const fullPay     = calcDayPay(sparkDagTyp, sparkStart, sparkEnd, settings.timlön) + sparkProv;
            const fullNetto   = fullPay * (1 - settings.skatt / 100);
            const earlyPay    = calcDayPay(sparkDagTyp, sparkStart, sparkEnd - earlyMin, settings.timlön) + sparkProv * ((totalMin - earlyMin) / totalMin);
            const lostByLeaving = fullPay - earlyPay;
            const krPerMin    = fullPay / totalMin;
            const krPerMinNetto = fullNetto / totalMin;
            const isWorking   = nowMin >= sparkStart && nowMin < sparkEnd;
            const isAfter     = nowMin >= sparkEnd;

            // ── TB-provision beräkning ──────────────────────────────────────
            const todayTB      = parseFloat(sparkTB) || 0;
            const befintligaDagar = days.filter(d => d.passTyp !== "annan");
            const befintligTB  = befintligaDagar.reduce((s, d) => s + (d.tb ?? 0), 0);
            const nyTotalTB    = befintligTB + todayTB;
            const nySäljDagar  = befintligaDagar.length + (todayTB > 0 ? 1 : 0);
            const nySnitt      = nySäljDagar > 0 ? nyTotalTB / nySäljDagar : 0;
            const stege        = settings.tbStege ?? [];
            const aktivTier    = [...stege].reverse().find(s => nySnitt >= s.snitt) ?? stege[0] ?? { procent: 0 };
            const nästaStege   = stege.find(s => s.snitt > nySnitt);
            const nyProv       = nyTotalTB * (aktivTier.procent / 100);
            const gammalProv   = befintligTB * (([...stege].reverse().find(s => (befintligaDagar.length > 0 ? befintligTB/befintligaDagar.length : 0) >= s.snitt) ?? stege[0] ?? { procent: 0 }).procent / 100);
            const tbBidrag     = nyProv - gammalProv;

            function SparkDagTypBtn({ typ }) {
              const m = DAG_META[typ];
              return (
                <button onClick={() => {
                  setSparkDagTyp(typ);
                  const d = settings.defaults?.[typ];
                  if (d) { setSparkStart(d.start); setSparkEnd(d.end); setSparkProv(d.prov ?? 400); }
                }} style={{
                  flex: 1, padding: "8px 4px", border: "none", borderRadius: 8,
                  background: sparkDagTyp === typ ? m.color : NC,
                  color: sparkDagTyp === typ ? "#001435" : "#5577aa",
                  fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "Outfit, sans-serif",
                }}>{m.emoji} {m.label}</button>
              );
            }

            return (
              <div>
                {/* Dagtyp & tider */}
                <div style={{ ...cardStyle, marginBottom: 14 }}>
                  <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Dagens pass</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                    {["vardag","lördag","söndag","röd"].map(t => <SparkDagTypBtn key={t} typ={t} />)}
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
                <div style={{ ...cardStyle, marginBottom: 14 }}>
                  <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>📊 Dagens TB (kr)</div>
                  <input
                    type="number" value={sparkTB} step={500} min={0}
                    placeholder="Ange ditt TB för dagen..."
                    onChange={e => setSparkTB(e.target.value)}
                    style={{ width: "100%", background: ND, border: `1px solid #f5a62355`, color: "#f5a623", borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, marginBottom: todayTB > 0 ? 12 : 0 }}
                  />
                  {todayTB > 0 && (
                    <div style={{ background: `${G}12`, border: `1px solid ${GD}`, borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div>
                          <div style={{ color: "#5577aa", fontSize: 11 }}>Nytt snitt ({nySäljDagar} säljdagar)</div>
                          <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>{Math.round(nySnitt).toLocaleString("sv-SE")} kr/dag</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ color: "#5577aa", fontSize: 11 }}>Serie</div>
                          <div style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 18 }}>{aktivTier.procent}%</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${N}` }}>
                        <span style={{ color: "#5577aa", fontSize: 12 }}>Provisionsbidrag idag</span>
                        <span style={{ color: G, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 16 }}>+{fmt(Math.max(0, tbBidrag))}</span>
                      </div>
                      {nästaStege ? (
                        <div style={{ color: "#5577aa", fontSize: 11, textAlign: "center", marginTop: 6 }}>
                          {(nästaStege.snitt - nySnitt).toLocaleString("sv-SE")} kr/dag till {nästaStege.procent}%-serien
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, background: `${G}20`, borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ color: G, fontSize: 11, fontWeight: 700 }}>🏆 Högsta serien!</div>
                          <div style={{ color: "#5577aa", fontSize: 11, marginTop: 2 }}>
                            {(nySnitt - (stege[stege.length - 2]?.snitt ?? 0)).toLocaleString("sv-SE")} kr/dag buffert kvar
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Live-räknare */}
                <div style={{
                  background: isWorking ? "#0d1f00" : NC,
                  border: `2px solid ${isWorking ? "#f5a623" : "#334"}`,
                  borderRadius: 20, padding: "20px 18px", marginBottom: 14,
                  textAlign: "center",
                }}>
                  {isAfter ? (
                    <>
                      <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
                      <div style={{ color: G, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Passet är klart!</div>
                      <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 32 }}>{fmt(fullPay)}</div>
                      <div style={{ color: "#5577aa", fontSize: 12, marginTop: 4 }}>intjänat detta pass</div>
                    </>
                  ) : isWorking ? (
                    <>
                      <div style={{ color: "#f5a62399", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>⚡ Tjänat hittills</div>
                      <div style={{ color: "#f5a623", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 42, lineHeight: 1 }}>
                        {Math.round(earnedNetto).toLocaleString("sv-SE")} kr
                      </div>
                      <div style={{ color: "#5577aa", fontSize: 12, marginTop: 4 }}>efter skatt ({settings.skatt}%) · brutto {Math.round(earnedSoFar).toLocaleString("sv-SE")} kr</div>
                      <div style={{ color: "#5577aa", fontSize: 12, margin: "6px 0 12px" }}>
                        {Math.floor(elapsed/60)}h {Math.round(elapsed%60)}min jobbat · {Math.floor(remaining/60)}h {Math.round(remaining%60)}min kvar
                      </div>
                      {/* Progress bar */}
                      <div style={{ height: 8, background: "#001435", borderRadius: 4, overflow:"hidden", marginBottom: 10 }}>
                        <div style={{ height:"100%", borderRadius:4, background:"linear-gradient(90deg,#f5a623,#5bc500)", width:`${progress*100}%`, transition:"width 1s linear" }} />
                      </div>
                      <div style={{ color: "#5577aa", fontSize: 12 }}>
                        ≈ {(krPerMinNetto).toFixed(2)} kr/min netto &nbsp;·&nbsp; {fmt(krPerMinNetto*60)}/timme
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🕐</div>
                      <div style={{ color: "#4466aa", fontSize: 14 }}>Passet börjar {minToHHMM(sparkStart)}</div>
                      <div style={{ color: "#fff", fontFamily: "Rajdhani, sans-serif", fontWeight: 700, fontSize: 26, marginTop: 8 }}>{fmt(fullPay)}</div>
                      <div style={{ color: "#5577aa", fontSize: 12 }}>förväntat för hela passet</div>
                    </>
                  )}
                </div>

                {/* Vad kostar det att gå hem tidigt? */}
                <div style={{ ...cardStyle, marginBottom: 14 }}>
                  <div style={{ color: "#f5a623", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                    💸 Vad förlorar du på att gå hem tidigt?
                  </div>
                  {/* Stepper */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:0, marginBottom: 16 }}>
                    <button onClick={() => setEarlyMin(m => Math.max(15, m-15))} style={{
                      width:44, height:44, borderRadius:"12px 0 0 12px", background:"#f5a62322",
                      border:"1px solid #f5a62355", color:"#f5a623", fontSize:22, fontWeight:900, cursor:"pointer",
                    }}>−</button>
                    <div style={{
                      width:100, height:44, background: ND, display:"flex", alignItems:"center", justifyContent:"center",
                      border:"1px solid #f5a62355", borderLeft:"none", borderRight:"none",
                      color:"#f5a623", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:20,
                    }}>{earlyMin} min</div>
                    <button onClick={() => setEarlyMin(m => Math.min(240, m+15))} style={{
                      width:44, height:44, borderRadius:"0 12px 12px 0", background:"#f5a62322",
                      border:"1px solid #f5a62355", color:"#f5a623", fontSize:22, fontWeight:900, cursor:"pointer",
                    }}>+</button>
                  </div>

                  <div style={{ background:"#2a0808", border:"1px solid #aa2222", borderRadius:12, padding:"14px 16px", marginBottom:12, textAlign:"center" }}>
                    <div style={{ color:"#cc6666", fontSize:11, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Du förlorar</div>
                    <div style={{ color:"#ff6666", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:34 }}>−{fmt(Math.max(0, lostByLeaving))}</div>
                    <div style={{ color:"#cc6666", fontSize:12, marginTop:4 }}>
                      om du går hem {earlyMin} min tidigt ({minToHHMM(Math.max(sparkStart, sparkEnd - earlyMin))})
                    </div>
                  </div>

                  {/* Snabbval */}
                  <div style={{ display:"flex", gap:6 }}>
                    {[15,30,60,120].map(m => {
                      const loss = Math.max(0, fullPay - calcDayPay(sparkDagTyp, sparkStart, sparkEnd - m, settings.timlön) - sparkProv);
                      return (
                        <button key={m} onClick={() => setEarlyMin(m)} style={{
                          flex:1, padding:"8px 0", background: earlyMin===m ? "#2a0808" : "transparent",
                          border:`1px solid ${earlyMin===m ? "#aa2222" : "#334"}`,
                          borderRadius:8, cursor:"pointer", fontFamily:"Outfit, sans-serif",
                        }}>
                          <div style={{ color: earlyMin===m ? "#ff6666" : "#5577aa", fontSize:10, fontWeight:700 }}>{m}min</div>
                          <div style={{ color: earlyMin===m ? "#ff4444" : "#334", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:12 }}>−{Math.round(loss).toLocaleString("sv-SE")}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Snabbfakta */}
                <div style={{ ...cardStyle }}>
                  <div style={{ color: G, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>🧠 Snabbfakta</div>
                  {[
                    ["Per minut (netto)", `${(krPerMinNetto).toFixed(2)} kr`],
                    ["Per timme (netto)", fmt(krPerMinNetto*60)],
                    ["Per timme (brutto)", fmt(krPerMin*60)],
                    ["En kaffe (32 kr)", `${Math.ceil(32/krPerMinNetto)} min jobb`],
                    ["En lunch (120 kr)", `${Math.ceil(120/krPerMinNetto)} min jobb`],
                    ["Hela passet netto", fmt(fullNetto)],
                    ["Hela passet brutto", fmt(fullPay)],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${N}` }}>
                      <span style={{ color:"#5577aa", fontSize:13 }}>{label}</span>
                      <span style={{ color:"#c8deff", fontFamily:"Rajdhani, sans-serif", fontWeight:700, fontSize:14 }}>{val}</span>
                    </div>
                  ))}
                </div>
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
          month={month}
          onSave={stege => { saveMonthStege(stege); setStegeOpen(false); }}
          onCancel={() => setStegeOpen(false)}
        />
      )}

      {addOpen && (
        <DayForm
          settings={settings}
          initialDay={editId ? days.find(d => d.id === editId) : null}
          onSave={day => { saveDay(day); setAddOpen(false); setEditId(null); }}
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
function StegeModal({ initialStege, month, onSave, onCancel }) {
  const [stege, setStege] = useState(initialStege.length > 0 ? initialStege : [{ snitt: 0, procent: 3 }]);

  function updateSteg(i, field, val) {
    setStege(prev => prev.map((s, j) => j === i ? { ...s, [field]: parseFloat(val) || 0 } : s));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", zIndex: 100 }}>
      <div style={{
        width: "100%", background: "#001a50", borderRadius: "24px 24px 0 0",
        padding: "20px 18px 40px", animation: "slideUp .25s ease",
        maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Provisionsstege</div>
          <button onClick={onCancel} style={{ background: "transparent", border: "none", color: "#5577aa", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ color: "#5577aa", fontSize: 12, marginBottom: 20, textTransform: "capitalize" }}>
          {new Date(month + "-01").toLocaleString("sv-SE", { month: "long", year: "numeric" })}
        </div>

        {stege.map((s, i) => (
          <div key={i} style={{ background: NC, border: `1px solid ${N}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Snitt från (kr/dag)</div>
              <input type="number" value={s.snitt} min={0} step={500}
                onChange={e => updateSteg(i, "snitt", e.target.value)}
                disabled={i === 0}
                style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: i === 0 ? "#445" : G, borderRadius: 8, padding: "10px 10px", fontSize: 16, fontFamily: "Rajdhani, sans-serif", fontWeight: 700 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#5577aa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Procent (%)</div>
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
          style={{ width: "100%", padding: "10px 0", background: "transparent", border: `1px solid ${N}`, color: "#5577aa", borderRadius: 10, cursor: "pointer", fontSize: 13, fontFamily: "Outfit, sans-serif", marginBottom: 20 }}>
          + Lägg till steg
        </button>

        <button onClick={() => onSave(stege)} style={{
          width: "100%", padding: 16, background: G, border: "none",
          borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
          cursor: "pointer", fontFamily: "Outfit, sans-serif",
        }}>Spara stege</button>
      </div>
    </div>
  );
}

// ─── Dag-formulär ─────────────────────────────────────────────────────────
function DayForm({ settings, initialDay, onSave, onSaveDefault, onCancel }) {
  const getDefaults = (typ) => settings.defaults?.[typ] || {};

  const [dagTyp, setDagTyp]       = useState(initialDay?.dagTyp  ?? "vardag");
  const [startMin, setStartMin]   = useState(initialDay?.startMin ?? getDefaults("vardag").start ?? 9*60+45);
  const [endMin, setEndMin]       = useState(initialDay?.endMin   ?? getDefaults("vardag").end   ?? 19*60);
  const [prov, setProv]           = useState(initialDay?.provision ?? getDefaults("vardag").prov ?? 400);
  const [passTyp, setPassTyp]     = useState(initialDay?.passTyp ?? "sälj");
  const [tb, setTb]               = useState(initialDay?.tb ?? "");
  const [skott, setSkott]         = useState(initialDay?.skott ?? "");
  const [savedDefault, setSavedDefault] = useState(false);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>
            {initialDay ? "Redigera pass" : "Lägg till pass"}
          </div>
          <button onClick={onCancel} style={{
            background: "transparent", border: "none", color: "#5577aa", fontSize: 22, cursor: "pointer",
          }}>✕</button>
        </div>

        {/* Dagtyp */}
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
            style={{ width: "100%", background: ND, border: `1px solid ${N}`, color: G, borderRadius: 10, padding: "12px 16px", fontSize: 20, fontFamily: "Rajdhani, sans-serif", fontWeight: 700, marginBottom: 20 }}
          />
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

        {/* Spara som standard-knapp */}
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
        })} style={{
          width: "100%", padding: 16, background: G, border: "none",
          borderRadius: 14, color: "#001435", fontWeight: 700, fontSize: 17,
          cursor: "pointer", fontFamily: "Outfit, sans-serif",
        }}>
          {initialDay ? "Spara ändringar" : "Lägg till pass"}
        </button>
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
