import { useEffect, useMemo, useRef, useState } from "react";
import { exportRowsViaSupabase } from "../lib/exportExcel";
import { parseReadingsWorkbook } from "../lib/importExcel";
import { supabase } from "../lib/supabaseClient";
import { subscribeReadings } from "../lib/readings";
import { signOut } from "../lib/auth";
import { loadClients, addClient, deactivateClient, subscribeClients } from "../lib/clients";

const byContract = (a, b) => Number(a.ct) - Number(b.ct);

export default function ManagerDashboard({ profile }) {
  const [tab, setTab] = useState("readings");
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [newClient, setNewClient] = useState({ contractNo: "", meterNo: "", sector: "", name: "" });
  const [addingClient, setAddingClient] = useState(false);
  const [clientMessage, setClientMessage] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("CONNECTING");
  const [lastSync, setLastSync] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [savingContract, setSavingContract] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [exportingAll, setExportingAll] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const loadReadings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meter_readings")
      .select("*")
      .eq("period", period)
      .order("updated_at", { ascending: false });

    if (!error) setRows(data || []);
    setLoading(false);
  };

  const loadEmployeesAndAssignments = async () => {
    setAssignmentLoading(true);
    const [{ data: employeeData, error: employeeError }, { data: assignmentData, error: assignmentError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role, active")
        .eq("role", "employee")
        .order("full_name"),
      supabase
        .from("employee_clients")
        .select("employee_id, contract_no, active")
        .eq("active", true),
    ]);

    if (!employeeError) {
      setEmployees(employeeData || []);
      if (!selectedEmployee && employeeData?.length) setSelectedEmployee(employeeData[0].id);
    }
    if (!assignmentError) setAssignments(assignmentData || []);
    setAssignmentLoading(false);
  };

  const syncNow = async () => {
    setSyncStatus("CONNECTING");
    try {
      await loadReadings();
      setLastSync(new Date());
      setSyncStatus("SUBSCRIBED");
    } catch {
      setSyncStatus(navigator.onLine ? "CONNECTING" : "OFFLINE");
    }
  };

  useEffect(() => {
    loadReadings();
    const online = () => syncNow();
    const offline = () => setSyncStatus("OFFLINE");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (!navigator.onLine) setSyncStatus("OFFLINE");
    const unsubscribe = subscribeReadings(payload => {
      const changed = payload.new || payload.old;
      if (!changed || changed.period !== period) return;

      setLastSync(new Date());
      setRows(prev => {
        if (payload.eventType === "DELETE") return prev.filter(x => x.id !== payload.old?.id);
        const i = prev.findIndex(x => x.contract_no === changed.contract_no);
        if (i === -1) return [changed, ...prev];
        const copy = [...prev];
        copy[i] = changed;
        return copy;
      });
    }, status => {
      setSyncStatus(status);
      if (status === "SUBSCRIBED") loadReadings();
    });
    return () => {
      unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [period]);

  useEffect(() => {
    loadEmployeesAndAssignments();
  }, []);

  const loadClientsList = async () => {
    setClientsLoading(true);
    try {
      setClients(await loadClients());
    } finally {
      setClientsLoading(false);
    }
  };

  useEffect(() => {
    loadClientsList();
    const unsubscribe = subscribeClients(() => loadClientsList());
    return unsubscribe;
  }, []);

  const removeClient = async c => {
    if (!window.confirm(`متأكد باغي تحذف "${c.nm}" (عقد ${c.ct})؟ الفهارس القديمة غادي تبقى محفوظة، غير الزبون غادي يختفي من اللوائح.`)) return;
    try {
      await deactivateClient(c.ct);
      setClients(prev => prev.filter(x => Number(x.ct) !== Number(c.ct)));
    } catch (error) {
      alert(error.message || "تعذر حذف الزبون.");
    }
  };

  const submitNewClient = async e => {
    e.preventDefault();
    if (!newClient.contractNo || !newClient.meterNo || !newClient.sector || !newClient.name) {
      setClientMessage("عمر جميع الخانات قبل الإضافة.");
      return;
    }
    setAddingClient(true);
    setClientMessage("");
    try {
      const created = await addClient({
        contractNo: newClient.contractNo,
        meterNo: newClient.meterNo,
        sector: newClient.sector,
        name: newClient.name,
      });
      setClients(prev => [...prev, created].sort(byContract));
      setNewClient({ contractNo: "", meterNo: "", sector: "", name: "" });
      setClientMessage("تمت إضافة الزبون ✓");
    } catch (error) {
      setClientMessage(error.message || "تعذرت إضافة الزبون (تأكد أن رقم العقد غير مستعمل من قبل).");
    } finally {
      setAddingClient(false);
    }
  };

  const selectedEmployeeName = employees.find(e => e.id === selectedEmployee)?.full_name || "";

  const selectedContracts = useMemo(() => {
    const set = new Set(
      assignments
        .filter(a => a.employee_id === selectedEmployee && a.active)
        .map(a => Number(a.contract_no))
    );
    return set;
  }, [assignments, selectedEmployee]);

  const assignmentVisibleClients = useMemo(() => {
    const q = assignmentSearch.trim().toLowerCase();
    return clients
      .filter(c => {
        const assigned = selectedContracts.has(Number(c.ct));
        if (assignmentFilter === "assigned" && !assigned) return false;
        if (assignmentFilter === "unassigned" && assigned) return false;
        if (!q) return true;
        return [c.ct, c.sn, c.s, c.nm].some(v => String(v).toLowerCase().includes(q));
      })
      .sort(byContract);
  }, [assignmentSearch, assignmentFilter, selectedContracts, clients]);

  const employeeStats = useMemo(() => {
    const counts = Object.fromEntries(employees.map(e => [e.id, 0]));
    assignments.forEach(a => {
      if (a.active && counts[a.employee_id] !== undefined) counts[a.employee_id] += 1;
    });
    return counts;
  }, [employees, assignments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.contract_no).includes(q) ||
      String(r.meter_no).toLowerCase().includes(q) ||
      String(r.employee_name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const toggleAssignment = async contractNo => {
    if (!selectedEmployee || savingContract !== null) return;
    const contract = Number(contractNo);
    const exists = selectedContracts.has(contract);
    setSavingContract(contract);
    setMessage("");

    try {
      if (exists) {
        const { error } = await supabase
          .from("employee_clients")
          .delete()
          .eq("employee_id", selectedEmployee)
          .eq("contract_no", contract);
        if (error) throw error;
        setAssignments(prev => prev.filter(a => !(a.employee_id === selectedEmployee && Number(a.contract_no) === contract)));
      } else {
        const { data, error } = await supabase
          .from("employee_clients")
          .upsert({ employee_id: selectedEmployee, contract_no: contract, active: true }, { onConflict: "employee_id,contract_no" })
          .select()
          .single();
        if (error) throw error;
        setAssignments(prev => [
          ...prev.filter(a => !(a.employee_id === selectedEmployee && Number(a.contract_no) === contract)),
          data,
        ]);
      }
    } catch (error) {
      setMessage(error.message || "تعذر حفظ التخصيص");
    } finally {
      setSavingContract(null);
    }
  };

  const assignAllVisible = async () => {
    if (!selectedEmployee || !assignmentVisibleClients.length || savingContract !== null) return;
    const missing = assignmentVisibleClients
      .map(c => Number(c.ct))
      .filter(ct => !selectedContracts.has(ct));
    if (!missing.length) return;

    setSavingContract("bulk");
    setMessage("");
    try {
      const payload = missing.map(contract_no => ({ employee_id: selectedEmployee, contract_no, active: true }));
      const { data, error } = await supabase
        .from("employee_clients")
        .upsert(payload, { onConflict: "employee_id,contract_no" })
        .select();
      if (error) throw error;
      setAssignments(prev => [...prev.filter(a => !(a.employee_id === selectedEmployee && missing.includes(Number(a.contract_no)))), ...(data || [])]);
    } catch (error) {
      setMessage(error.message || "تعذر تخصيص الزبناء");
    } finally {
      setSavingContract(null);
    }
  };

  const removeAllVisible = async () => {
    if (!selectedEmployee || !assignmentVisibleClients.length || savingContract !== null) return;
    const selected = assignmentVisibleClients
      .map(c => Number(c.ct))
      .filter(ct => selectedContracts.has(ct));
    if (!selected.length) return;

    setSavingContract("bulk");
    setMessage("");
    try {
      const { error } = await supabase
        .from("employee_clients")
        .delete()
        .eq("employee_id", selectedEmployee)
        .in("contract_no", selected);
      if (error) throw error;
      setAssignments(prev => prev.filter(a => !(a.employee_id === selectedEmployee && selected.includes(Number(a.contract_no)))));
    } catch (error) {
      setMessage(error.message || "تعذر إزالة التخصيص");
    } finally {
      setSavingContract(null);
    }
  };

  const exportAllClients = async () => {
    if (exportingAll) return;
    setExportingAll(true);
    try {
      // نبعث بس البيانات الخام لكل الزبناء — شكل ملف الإكسل يُبنى كامل
      // داخل Supabase Edge Function "export-releve-xlsx"، بنفس طريقة
      // تصدير الموظف.
      const rowsByContract = new Map(rows.map(r => [Number(r.contract_no), r]));
      const exportRows = [];
      clients.slice().sort(byContract).forEach(c => {
        const row = rowsByContract.get(Number(c.ct));
        const newVals = row?.indexes || [];
        const old = c.a || [];
        c.p.forEach((poste, i) => {
          exportRows.push({
            secteur: c.s,
            clientName: c.nm,
            meterNo: c.sn,
            contractNo: c.ct,
            employeeId: row?.employee_id ?? "",
            employee: row?.employee_name || "—",
            seq: i + 1,
            label: poste,
            oldIndex: old[i] ?? "",
            newIndex: newVals[i] ?? "",
          });
        });
      });
      await exportRowsViaSupabase({ rows: exportRows, period });
    } catch (error) {
      alert(error.message || "تعذر تصدير ملف Excel.");
    } finally {
      setExportingAll(false);
    }
  };

  // يقرأ ملف Excel فيه قراءات (أشهر سابقة عادة) ويتحقق من صحة كل سطر
  // بدون ما يحفظ أي شي بعد — الحفظ الفعلي يصير بعد ضغط زر التأكيد.
  const handleImportFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const knownContractNos = clients.map(c => c.ct);
      const result = parseReadingsWorkbook(buffer, knownContractNos);
      setImportResult(result);
    } catch (error) {
      alert(error.message || "تعذر قراءة الملف. تأكد إنه ملف Excel صحيح.");
    } finally {
      setImporting(false);
    }
  };

  // يحفظ كل الأسطر الصالحة دفعة وحدة (upsert) بجدول القراءات.
  const confirmImport = async () => {
    if (!importResult?.valid?.length || importing) return;
    setImporting(true);
    try {
      const payloads = importResult.valid.map(r => ({
        contract_no: r.contractNo,
        meter_no: r.meterNo,
        period: r.period,
        reading_date: r.readingDate,
        indexes: r.indexes,
        employee_id: profile.id,
        employee_name: `${profile.full_name} (استيراد)`,
        updated_at: new Date().toISOString(),
      }));
      const chunkSize = 500;
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const chunk = payloads.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("meter_readings")
          .upsert(chunk, { onConflict: "contract_no,period" });
        if (error) throw error;
      }
      alert(`تم استيراد ${payloads.length} قراءة بنجاح.`);
      setImportResult(null);
      loadReadings();
    } catch (error) {
      alert(error.message || "تعذر حفظ القراءات المستوردة.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#F5F6F8", paddingBottom: 30, fontFamily: "Arial,sans-serif", color: "#16202A" }}>
      <header style={{ background: "#0B4F6C", color: "#fff", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 19 }}>لوحة المسؤول</div>
            <div style={{ fontSize: 12, opacity: .85 }}>{profile.full_name}</div>
          </div>
          <button onClick={signOut} style={{ padding: "8px 12px", borderRadius: 9, border: 0 }}>خروج</button>
        </div>

        <div style={{ marginTop: 9, fontSize: 11, opacity: .95, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}><span>مزامنة الموظفين: {syncStatus === "SUBSCRIBED" ? "متصلة ✓ — أي قراءة جديدة تظهر هنا مباشرة" : syncStatus === "OFFLINE" ? "غير متصل — سيتم التحديث عند عودة الإنترنت" : "جاري الاتصال..."}{lastSync ? ` · آخر تحديث ${lastSync.toLocaleTimeString("ar-MA", {hour:"2-digit", minute:"2-digit"})}` : ""}</span><button onClick={syncNow} style={{border:0,borderRadius:7,padding:"5px 8px",fontSize:10,fontWeight:800}}>مزامنة الآن</button></div>

        <div style={{ display: "flex", gap: 7, marginTop: 14 }}>
          <button onClick={() => setTab("readings")} style={tabButton(tab === "readings")}>القراءات</button>
          <button onClick={() => setTab("assignments")} style={tabButton(tab === "assignments")}>الموظفون والزبناء</button>
          <button onClick={() => setTab("clients")} style={tabButton(tab === "clients")}>الزبناء</button>
        </div>
      </header>

      {tab === "readings" ? (
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: 11, borderRadius: 9, border: "1px solid #CBD5DB" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عقد / عداد / موظف" style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #CBD5DB" }} />
          </div>

          <button onClick={exportAllClients} disabled={exportingAll || !clients.length} style={{ width: "100%", padding: 11, borderRadius: 9, border: 0, background: "#F0A202", fontWeight: 900, marginBottom: 12, opacity: exportingAll ? .7 : 1 }}>
            {exportingAll ? "جاري التصدير..." : "تصدير جميع الزبناء (Excel)"}
          </button>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>استيراد قراءات من ملف Excel (أشهر سابقة)</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportFile}
              disabled={importing}
              style={{ marginBottom: 8, fontSize: 12 }}
            />
            {importing && <div style={{ fontSize: 12, color: "#5B6B78" }}>جاري المعالجة...</div>}
            {importResult && (
              <div style={{ fontSize: 13, marginTop: 6 }}>
                <div style={{ color: "#2E7D32", fontWeight: 800 }}>✓ صالحة للحفظ: {importResult.valid.length}</div>
                {importResult.invalid.length > 0 && (
                  <div style={{ color: "#B00020", fontWeight: 800, marginTop: 4 }}>⚠ غير صالحة: {importResult.invalid.length}</div>
                )}
                {importResult.invalid.length > 0 && (
                  <ul style={{ maxHeight: 150, overflow: "auto", fontSize: 11, color: "#5B6B78", marginTop: 6, paddingInlineStart: 18 }}>
                    {importResult.invalid.slice(0, 50).map((x, idx) => (
                      <li key={idx}>سطر {x.line} (عقد {x.contractNo || "—"}): {x.reason}</li>
                    ))}
                    {importResult.invalid.length > 50 && <li>... و{importResult.invalid.length - 50} سطر آخر</li>}
                  </ul>
                )}
                {importResult.valid.length > 0 && (
                  <button onClick={confirmImport} disabled={importing} style={{ marginTop: 10, width: "100%", padding: 11, borderRadius: 9, border: 0, background: "#0B4F6C", color: "#fff", fontWeight: 900, opacity: importing ? .7 : 1 }}>
                    {importing ? "جاري الحفظ..." : `تأكيد استيراد ${importResult.valid.length} قراءة`}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <b>{filtered.length}</b> قراءة في {period}
            {loading ? <span> — جاري التحميل...</span> : <span> — التحديث المباشر مفعل ✓</span>}
          </div>

          {filtered.map(row => (
            <div key={row.id} style={{ background: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <div style={{ fontWeight: 900 }}>عقد {row.contract_no}</div>
              <div style={{ fontSize: 12, color: "#5B6B78" }}>عداد: {row.meter_no}</div>
              <div style={{ fontSize: 12, color: "#5B6B78" }}>الموظف: {row.employee_name || "—"}</div>
              <div style={{ fontSize: 12, color: "#5B6B78" }}>التاريخ: {row.reading_date}</div>
              <div style={{ marginTop: 8, fontFamily: "monospace", wordBreak: "break-all" }}>{(row.indexes || []).join(" · ")}</div>
            </div>
          ))}
          {!loading && filtered.length === 0 && <Empty text="لا توجد قراءات لهذه الفترة." />}
        </div>
      ) : tab === "assignments" ? (
        <div style={{ padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>توزيع الزبناء على الموظفين</div>
            <div style={{ color: "#5B6B78", fontSize: 12, marginTop: 5 }}>
              اختر موظفًا ثم فعّل الزبناء الذين سيظهرون له في تطبيق القراءة. التغيير يحفظ مباشرة.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginBottom: 12 }}>
            {employees.map(employee => (
              <button key={employee.id} onClick={() => setSelectedEmployee(employee.id)} style={{
                textAlign: "right", padding: 12, borderRadius: 11,
                border: selectedEmployee === employee.id ? "2px solid #0B4F6C" : "1px solid #D7DEE3",
                background: selectedEmployee === employee.id ? "#EAF5F9" : "#fff",
              }}>
                <div style={{ fontWeight: 900 }}>{employee.full_name}</div>
                <div style={{ fontSize: 11, color: "#5B6B78", marginTop: 4 }}>{employeeStats[employee.id] || 0} زبون مخصص</div>
              </button>
            ))}
          </div>

          {assignmentLoading ? <div style={{ padding: 20 }}>جاري تحميل الموظفين...</div> : employees.length === 0 ? (
            <Empty text="لا توجد حسابات موظفين في profiles. يجب إنشاء حساب الموظف أولًا في Supabase Authentication ثم إضافة ملفه في profiles." />
          ) : (
            <>
              <div style={{ background: "#fff", borderRadius: 14, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 900 }}>الموظف: {selectedEmployeeName || "—"}</div>
                <div style={{ fontSize: 12, color: "#5B6B78", marginTop: 3 }}>{selectedContracts.size} / {clients.length} زبون مخصص</div>
              </div>

              <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
                <input value={assignmentSearch} onChange={e => setAssignmentSearch(e.target.value)} placeholder="بحث اسم / عقد / عداد / قطاع" style={{ flex: 1, padding: 11, borderRadius: 9, border: "1px solid #CBD5DB" }} />
                <select value={assignmentFilter} onChange={e => setAssignmentFilter(e.target.value)} style={{ padding: 10, borderRadius: 9, border: "1px solid #CBD5DB" }}>
                  <option value="all">الكل</option>
                  <option value="assigned">مخصص</option>
                  <option value="unassigned">غير مخصص</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
                <button onClick={assignAllVisible} disabled={savingContract !== null} style={{ flex: 1, padding: 10, border: 0, borderRadius: 9, background: "#0B4F6C", color: "#fff", fontWeight: 800 }}>تخصيص الظاهر</button>
                <button onClick={removeAllVisible} disabled={savingContract !== null} style={{ flex: 1, padding: 10, border: "1px solid #D32F2F", borderRadius: 9, background: "#fff", color: "#B00020", fontWeight: 800 }}>إزالة تخصيص الظاهر</button>
              </div>

              {message && <div style={{ background: "#FFF3F3", color: "#B00020", border: "1px solid #D32F2F", borderRadius: 9, padding: 10, marginBottom: 10, fontSize: 12 }}>{message}</div>}

              {assignmentVisibleClients.map(c => {
                const assigned = selectedContracts.has(Number(c.ct));
                return (
                  <div key={c.ct} style={{ background: "#fff", borderRadius: 11, padding: 11, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nm}</div>
                      <div style={{ fontSize: 11, color: "#5B6B78", marginTop: 3 }}>{c.s} · عقد {c.ct} · عداد {c.sn}</div>
                    </div>
                    <button onClick={() => toggleAssignment(c.ct)} disabled={savingContract !== null} style={{
                      minWidth: 90, padding: "8px 10px", borderRadius: 9,
                      border: assigned ? "1px solid #2E7D32" : "1px solid #CBD5DB",
                      background: assigned ? "#EAF6EC" : "#fff", color: assigned ? "#2E7D32" : "#39444D", fontWeight: 900,
                    }}>
                      {savingContract === Number(c.ct) ? "..." : assigned ? "مخصص ✓" : "تخصيص"}
                    </button>
                  </div>
                );
              })}
              {assignmentVisibleClients.length === 0 && <Empty text="لا توجد نتائج." />}
            </>
          )}
        </div>
      ) : null}

      {tab === "clients" && (
        <div style={{ padding: 16 }}>
          <form onSubmit={submitNewClient} style={{ background: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>زيادة زبون MT جديد</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
                placeholder="اسم الزبون" style={inputStyle} />
              <input value={newClient.sector} onChange={e => setNewClient(p => ({ ...p, sector: e.target.value }))}
                placeholder="القطاع (مثلا LAAOUINA)" style={inputStyle} />
              <input value={newClient.meterNo} onChange={e => setNewClient(p => ({ ...p, meterNo: e.target.value }))}
                placeholder="رقم العداد (N° SERIE)" style={inputStyle} />
              <input value={newClient.contractNo} onChange={e => setNewClient(p => ({ ...p, contractNo: e.target.value.replace(/[^0-9]/g, "") }))}
                placeholder="رقم العقد (أرقام فقط)" inputMode="numeric" style={inputStyle} />
            </div>
            {clientMessage && (
              <div style={{ marginTop: 10, fontSize: 12, color: clientMessage.includes("✓") ? "#2E7D32" : "#B00020" }}>{clientMessage}</div>
            )}
            <button type="submit" disabled={addingClient} style={{ marginTop: 10, width: "100%", padding: 11, borderRadius: 9, border: 0, background: "#0B4F6C", color: "#fff", fontWeight: 900 }}>
              {addingClient ? "جاري الإضافة..." : "إضافة الزبون"}
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: "#5B6B78" }}>
              الفهرس القديم سيبدأ من صفر لجميع الخانات (22 خانة بنفس ترتيب Waterp)، وبعد الإضافة خاصك تدير "تخصيص" ليه من تبويب "الموظفون والزبناء".
            </div>
          </form>

          <div style={{ background: "#fff", borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 13, fontWeight: 800 }}>
            {clientsLoading ? "جاري التحميل..." : `${clients.length} زبون MT مسجل`}
          </div>

          {clients.slice().sort(byContract).map(c => (
            <div key={c.ct} style={{ background: "#fff", borderRadius: 11, padding: 11, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 900 }}>{c.nm}</div>
                <div style={{ fontSize: 11, color: "#5B6B78", marginTop: 3 }}>{c.s} · عقد {c.ct} · عداد {c.sn}</div>
              </div>
              <button onClick={() => removeClient(c)} style={{ flexShrink: 0, border: "1px solid #E0A0A0", background: "#FDEDED", color: "#B00020", borderRadius: 8, padding: "7px 10px", fontWeight: 800, fontSize: 12 }}>
                حذف
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle = { padding: 11, borderRadius: 9, border: "1px solid #CBD5DB", fontFamily: "inherit" };

function tabButton(active) {
  return {
    flex: 1,
    padding: 10,
    borderRadius: 9,
    border: active ? "1px solid #fff" : "1px solid rgba(255,255,255,.35)",
    background: active ? "#fff" : "rgba(255,255,255,.12)",
    color: active ? "#0B4F6C" : "#fff",
    fontWeight: 900,
  };
}

function Empty({ text }) {
  return <div style={{ background: "#fff", borderRadius: 12, padding: 20, textAlign: "center", color: "#687781" }}>{text}</div>;
}
