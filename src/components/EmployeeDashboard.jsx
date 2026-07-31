import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { signOut } from "../lib/auth";
import {
  currentPeriod,
  loadAssignedContracts,
  loadReadingsForContracts,
  saveReading,
  subscribeReadings,
  flushPendingReadings,
  pendingReadingsCount,
} from "../lib/readings";
import { CLIENTS } from "../data/clients";
import { N_POSTES, isLowerIndex, totalIssues } from "../lib/validation";

const empty = () => Array(N_POSTES).fill("");

function periodLabel(period) {
  const [y, m] = period.split("-").map(Number);
  return `${String(m).padStart(2, "0")}/${y}`;
}

function normalize(v) {
  return Array.from({ length: N_POSTES }, (_, i) =>
    v?.[i] === undefined || v?.[i] === null ? "" : String(v[i])
  );
}

export default function EmployeeDashboard({ profile }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [assigned, setAssigned] = useState([]);
  const [idx, setIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [list, setList] = useState(false);
  const [values, setValues] = useState({});
  const [previous, setPrevious] = useState({});
  const [saveState, setSaveState] = useState("idle");
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("CONNECTING");
  const [lastSync, setLastSync] = useState(null);
  const [pending, setPending] = useState(pendingReadingsCount());
  const saveTimer = useRef(null);

  const visibleClients = useMemo(() => {
    const set = new Set(assigned.map(Number));
    const base = assigned.length ? CLIENTS.filter(c => set.has(Number(c.ct))) : [];
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(c =>
      String(c.ct).includes(q) ||
      String(c.sn).toLowerCase().includes(q) ||
      String(c.s).toLowerCase().includes(q) ||
      String(c.nm).toLowerCase().includes(q)
    );
  }, [assigned, search]);

  const baseClients = useMemo(() => {
    const set = new Set(assigned.map(Number));
    return assigned.length ? CLIENTS.filter(c => set.has(Number(c.ct))) : [];
  }, [assigned]);

  const client = baseClients[idx] || baseClients[0];
  const cVals = client ? (values[client.ct] || empty()) : empty();
  const oldVals = client ? (previous[client.ct] || client.a || empty()) : empty();

  const load = async () => {
    setLoading(true);
    try {
      const contracts = await loadAssignedContracts(profile.id);
      setAssigned(contracts);

      const { current, previous } = await loadReadingsForContracts(contracts, period);
      const nextValues = {};
      const nextPrevious = {};
      Object.entries(current).forEach(([contractNo, row]) => {
        nextValues[contractNo] = normalize(row.indexes);
      });
      Object.entries(previous).forEach(([contractNo, row]) => {
        nextPrevious[contractNo] = normalize(row.indexes);
      });

      setValues(nextValues);
      setPrevious(nextPrevious);
      setIdx(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [period]);

  useEffect(() => {
    const assignedSet = new Set(assigned.map(Number));
    return subscribeReadings(payload => {
      const row = payload.new || payload.old;
      if (!row || row.period !== period || !assignedSet.has(Number(row.contract_no))) return;
      setLastSync(new Date());
      if (payload.eventType === "DELETE") {
        setValues(prev => { const copy = { ...prev }; delete copy[row.contract_no]; return copy; });
        return;
      }
      setValues(prev => ({ ...prev, [row.contract_no]: normalize(row.indexes) }));
    }, status => setSyncStatus(status));
  }, [period, assigned]);

  useEffect(() => {
    const online = async () => {
      setSyncStatus("CONNECTING");
      try {
        await flushPendingReadings();
        setPending(pendingReadingsCount());
        await load();
        setLastSync(new Date());
      } catch {}
    };
    const offline = () => {
      setSyncStatus("OFFLINE");
      setPending(pendingReadingsCount());
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (!navigator.onLine) setSyncStatus("OFFLINE");
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [period, profile.id]);

  const persist = next => {
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!client) return;
      try {
        await saveReading({
          contractNo: client.ct,
          meterNo: client.sn,
          period,
          readingDate: new Date().toISOString().slice(0, 10),
          indexes: next[client.ct],
          employeeId: profile.id,
          employeeName: profile.full_name,
        });
        setPending(pendingReadingsCount());
        setSaveState("saved");
      } catch {
        setPending(pendingReadingsCount());
        setSaveState("error");
      }
    }, 500);
  };

  const setDigit = (posIdx, raw) => {
    if (!client) return;
    const cleaned = raw.replace(/[^0-9]/g, "").slice(0, 9);
    setValues(prev => {
      const nextValues = {
        ...prev,
        [client.ct]: (prev[client.ct] || empty()).map((v, i) => i === posIdx ? cleaned : v)
      };
      persist(nextValues);
      return nextValues;
    });
  };

  const syncNow = async () => {
    setSyncStatus("CONNECTING");
    try {
      await flushPendingReadings();
      setPending(pendingReadingsCount());
      await load();
      setLastSync(new Date());
      setSyncStatus("SUBSCRIBED");
    } catch {
      setSyncStatus(navigator.onLine ? "CONNECTING" : "OFFLINE");
    }
  };

  const issues = totalIssues(cVals);
  const lower = cVals.reduce((acc, v, i) => {
    if (isLowerIndex(oldVals[i], v, i)) acc.push(i);
    return acc;
  }, []);

  const exportExcel = () => {
    const rows = [];
    visibleClients.forEach(c => {
      const v = values[c.ct] || empty();
      const old = previous[c.ct] || c.a || empty();
      c.p.forEach((poste, i) => {
        rows.push({
          "الفترة": periodLabel(period),
          "الموظف": profile.full_name,
          "القطاع": c.s,
          "رقم العداد": c.sn,
          "رقم العقد": c.ct,
          "اسم الزبون": c.nm,
          "Index": i + 1,
          "البيان": poste,
          "الفهرس القديم": old[i] ?? "",
          "الفهرس الجديد": v[i] ?? "",
          "الفرق": v[i] === "" || old[i] === "" ? "" : Number(v[i]) - Number(old[i]),
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      {wch:10},{wch:22},{wch:15},{wch:14},{wch:12},{wch:38},
      {wch:8},{wch:12},{wch:15},{wch:15},{wch:10}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Releve MT");
    XLSX.writeFile(wb, `releve_MT_${period}.xlsx`);
  };

  const goToClient = contractNo => {
    const i = baseClients.findIndex(c => Number(c.ct) === Number(contractNo));
    if (i >= 0) setIdx(i);
    setList(false);
    setSearch("");
  };

  const goTo = i => {
    const target = visibleClients[i];
    if (target) goToClient(target.ct);
  };

  if (loading) return <div dir="rtl" style={{padding:30}}>جاري تحميل قائمة الزبناء...</div>;

  if (!client) return (
    <div dir="rtl" style={{padding:30}}>
      <h3>لا توجد زبناء مخصصون لك</h3>
      <p>اطلب من المسؤول ربط العقود بحساب الموظف.</p>
      <button onClick={signOut}>خروج</button>
    </div>
  );

  return (
    <div dir="rtl" style={{fontFamily:"Arial,sans-serif", background:"#F5F6F8", minHeight:"100vh", color:"#16202A"}}>
      <style>{`*{box-sizing:border-box}input:focus{outline:2px solid #0B4F6C}`}</style>

      <header style={{background:"#0B4F6C",color:"#fff",padding:"13px 16px",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <div>
            <div style={{fontWeight:900,fontSize:17}}>قراءة عدادات MT</div>
            <div style={{fontSize:11,opacity:.85}}>{profile.full_name} · {assigned.length} زبون</div>
          </div>
          <button onClick={signOut} style={{border:0,borderRadius:9,padding:"8px 11px"}}>خروج</button>
        </div>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:9,fontSize:11,opacity:.95}}><span>مزامنة الهاتف: {syncStatus === "SUBSCRIBED" ? "متصلة ✓" : syncStatus === "OFFLINE" ? "غير متصل — سيُعاد الإرسال تلقائيًا" : "جاري الاتصال..."}{pending ? ` · ${pending} قراءة تنتظر الإرسال` : ""}</span><button onClick={syncNow} style={{border:0,borderRadius:7,padding:"5px 8px",fontSize:10,fontWeight:800}}>مزامنة الآن</button></div>

        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button onClick={() => setList(true)} style={{flex:1,padding:9,borderRadius:9,border:"1px solid rgba(255,255,255,.4)",background:"rgba(255,255,255,.15)",color:"#fff"}}>
            قائمة الزبناء
          </button>
          <input type="month" value={period} onChange={e=>e.target.value && setPeriod(e.target.value)}
            style={{flex:1,padding:9,borderRadius:9,border:0,fontWeight:800}} />
        </div>
        <div style={{marginTop:8,fontSize:11}}>
          الحالة: {saveState === "saving" ? "جاري الحفظ..." : saveState === "saved" ? "تم الحفظ ✓" : saveState === "error" ? "خطأ في الحفظ" : "جاهز"}
        </div>
        <div style={{marginTop:4,fontSize:11}}>الزبون {Math.min(idx + 1, baseClients.length)} / {baseClients.length}</div>
      </header>

      {!list ? (
        <>
          <div style={{padding:"14px 16px 0"}}>
            <div style={{background:"#fff",borderRadius:14,padding:14,boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>
              <div style={{fontSize:11,color:"#5B6B78"}}>{client.s}</div>
              <div style={{fontSize:16,fontWeight:900,marginTop:3}}>{client.nm}</div>
              <div style={{display:"flex",gap:15,marginTop:8,fontSize:12,color:"#5B6B78"}}>
                <span>عداد: <b>{client.sn}</b></span>
                <span>عقد: <b>{client.ct}</b></span>
              </div>
            </div>
          </div>

          {issues.length > 0 && (
            <div style={{margin:"12px 16px 0",background:"#FFF3F3",border:"1px solid #D32F2F",color:"#B00020",borderRadius:12,padding:12,fontSize:12}}>
              <b>تحقق من Total:</b>
              {issues.map(x => <div key={x.label}>{x.label} — الفرق {x.diff}</div>)}
            </div>
          )}

          <div style={{padding:"12px 16px 120px"}}>
            {client.p.map((poste,i) => {
              const lowerAlert = lower.includes(i);
              const newValue = cVals[i];
              const oldValue = oldVals[i];
              const diff = newValue !== "" && oldValue !== "" ? Number(newValue)-Number(oldValue) : null;
              const isTotal = [3,7,11].includes(i) || [3].includes(i) || [11].includes(i);
              const totalBad = issues.some(x => x.total === i || x.parts.includes(i));

              return (
                <div key={i} style={{
                  display:"grid",gridTemplateColumns:"30px 60px 76px 1fr 58px",
                  alignItems:"center",gap:7,background:"#fff",borderRadius:11,padding:"9px 8px",marginBottom:7,
                  border: lowerAlert ? "2px solid #D32F2F" : totalBad ? "2px solid #F0A202" : "1px solid transparent"
                }}>
                  <div style={{background:"#0B4F6C",color:"#fff",borderRadius:7,padding:"6px 2px",textAlign:"center",fontWeight:800,fontSize:11}}>{i+1}</div>
                  <div style={{fontWeight:800,fontSize:12}}>{poste}</div>
                  <div style={{fontSize:10,textAlign:"center",color:"#5B6B78"}}>
                    <div>قديم</div><b>{oldValue === "" ? "—" : Number(oldValue).toLocaleString("en-US")}</b>
                  </div>
                  <input value={newValue} onChange={e=>setDigit(i,e.target.value)} inputMode="numeric"
                    placeholder="Index"
                    style={{width:"100%",padding:"9px 5px",borderRadius:8,border:lowerAlert?"2px solid #D32F2F":"1px solid #CBD5DB",fontFamily:"monospace",fontSize:16,fontWeight:800,textAlign:"center"}} />
                  <div style={{fontSize:10,textAlign:"center",fontWeight:800,color:lowerAlert?"#D32F2F":diff === null ? "#9AA6B0":diff<0?"#D32F2F":"#2E7D32"}}>
                    {diff === null ? "—" : (diff > 0 ? "+" : "") + diff}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #E5E9EC",padding:"9px 12px",display:"flex",gap:7,zIndex:15}}>
            <button onClick={()=>idx>0 && goToClient(baseClients[idx-1].ct)} disabled={idx===0} style={{flex:1,padding:11,borderRadius:9,border:"1px solid #D7DEE3",background:"#fff"}}>السابق</button>
            <button onClick={exportExcel} style={{flex:1.3,padding:11,borderRadius:9,border:0,background:"#F0A202",fontWeight:900}}>Excel</button>
            <button onClick={()=>idx<baseClients.length-1 && goToClient(baseClients[idx+1].ct)} disabled={idx===baseClients.length-1} style={{flex:1,padding:11,borderRadius:9,border:0,background:"#0B4F6C",color:"#fff"}}>التالي</button>
          </div>
        </>
      ) : (
        <div style={{padding:"14px 16px 30px"}}>
          <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث بالاسم، العقد، العداد..."
            style={{width:"100%",padding:12,borderRadius:10,border:"1px solid #D7DEE3",marginBottom:10}} />
          {visibleClients.map((c,i)=>{
            const filled=(values[c.ct]||[]).filter(v=>v!=="").length;
            return <div key={c.ct} onClick={()=>goTo(i)} style={{background:"#fff",borderRadius:10,padding:11,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div><b>{c.nm}</b><div style={{fontSize:11,color:"#5B6B78"}}>{c.s} · عقد {c.ct}</div></div>
              <span style={{background:filled===N_POSTES?"#2E7D32":filled?"#F0A202":"#B9C4CC",color:"#fff",borderRadius:20,padding:"3px 8px",fontSize:11}}>{filled}/{N_POSTES}</span>
            </div>
          })}
          <button onClick={()=>setList(false)} style={{width:"100%",padding:12,borderRadius:10,border:"1px solid #D7DEE3",background:"#fff",fontWeight:800}}>رجوع</button>
        </div>
      )}
    </div>
  );
}
