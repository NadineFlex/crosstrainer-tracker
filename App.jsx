import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Zap, Navigation, Gauge, Target, Plus, Calendar, User, Activity, Camera, Image, Loader2, Check, AlertCircle, Trash2, Download, Upload, Pencil, TrendingUp } from 'lucide-react';

// ---------- Konfiguration ----------
const DEFAULT_GOALS = { calories: 2500, distance: 75, resistance: 8 };
// OCR läuft lokal auf dem Gerät. Beim ersten Scan werden OCR-Sprachdaten geladen.
import { createWorker } from 'tesseract.js';
import { parseDisplayText } from './scanner.js';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const monday = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return todayFrom(d); };
const todayFrom = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const numberValue = v => v === '' || v == null ? null : Number(String(v).replace(',', '.'));
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(new Date(`${d}T12:00:00`).getTime()) && todayFrom(new Date(`${d}T12:00:00`)) === d;
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const EMPTY_FORM = {
  date: today(),
  duration: '', calories: '', distance: '', resistance: '',
  heartRate: '', watts: '', speed: '', upm: '', mets: '', maxSpeed: '', maxWatts: '',
};

// Statische Tailwind-Klassen (keine dynamischen Strings, sonst werden sie nicht erzeugt)
const COLORS = {
  calories:   { text: 'text-teal-300', bar: 'bg-teal-400', card: 'bg-teal-900/20 border-teal-400/30' },
  distance:   { text: 'text-sky-300',   bar: 'bg-cyan-500',   card: 'bg-sky-900/20 border-sky-400/30' },
  resistance: { text: 'text-violet-300', bar: 'bg-purple-500', card: 'bg-violet-900/20 border-violet-400/30' },
};

const METRIC_LABELS = {
  calories: 'Kalorien', distance: 'Distanz', resistance: 'Ø Widerstand',
};

// ---------- Hilfsfunktionen ----------

// "30:29" -> 30 Minuten, "1:05:00" -> 65
const parseDurationToMinutes = (value) => {
  if (!value || typeof value !== 'string') return '';
  const parts = value.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n) || n < 0) || ![2,3].includes(parts.length)) return '';
  if (parts.length === 2 && parts[1] >= 60 || parts.length === 3 && (parts[1] >= 60 || parts[2] >= 60)) return '';
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
  return '';
};

const toFormValue = (v) => (v === null || v === undefined || v === '' ? '' : String(v));

const mapExtractedToForm = (d) => ({
  duration: toFormValue(parseDurationToMinutes(d.duration)),
  calories: toFormValue(d.calories),
  distance: toFormValue(d.distance),
  resistance: toFormValue(d.resistance),
  heartRate: toFormValue(d.avgHeartRate),
  watts: toFormValue(d.avgWatts),
  speed: toFormValue(d.avgSpeed),
  upm: toFormValue(d.avgUPM),
  mets: toFormValue(d.avgMets),
  maxSpeed: toFormValue(d.maxSpeed),
  maxWatts: toFormValue(d.maxWatts),
});

async function extractFromImage(file) {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(file);
    const extracted = parseDisplayText(data.text);
    if (!Object.keys(extracted).length) throw new Error('Keine eindeutig zuordenbaren Werte gefunden. Bitte manuell eintragen oder ein schärferes Foto machen.');
    return { extracted, rawText: data.text };
  } finally { await worker.terminate(); }
}
// ---------- Persistenz ----------
// Speichert Trainings und Körperdaten im Browser (localStorage).
// Funktioniert in deiner eigenen App. In der Claude-Vorschau gibt es keinen
// dauerhaften Browserspeicher, dort fällt die App aber nicht aus.
const STORAGE_KEY = 'crosstrainer-pro-v1';

const loadData = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: [], bodyLog: [] };
    const parsed = JSON.parse(raw);
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      bodyLog: Array.isArray(parsed.bodyLog) ? parsed.bodyLog : [],
      goals: parsed.goals && typeof parsed.goals === 'object' ? { ...DEFAULT_GOALS, ...parsed.goals } : DEFAULT_GOALS,
    };
  } catch {
    return { sessions: [], bodyLog: [] };
  }
};

const saveData = (data) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Speicher nicht verfügbar (z. B. Vorschau) – ignorieren
  }
};

// ---------- Hauptkomponente ----------
export default function CrosstrainerPro() {
  const [tab, setTab] = useState('dashboard');
  const [sessions, setSessions] = useState(() => loadData().sessions);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanOk, setScanOk] = useState(false);
  const [scanText, setScanText] = useState('');
  const [chartMetric, setChartMetric] = useState('calories');
  const [chartPeriod, setChartPeriod] = useState('month');
  const [body, setBody] = useState({ weight: '', bodyFat: '', muscle: '' });
  const [bodyLog, setBodyLog] = useState(() => loadData().bodyLog);
  const [goals, setGoals] = useState(() => loadData().goals || DEFAULT_GOALS);
  const [editingId, setEditingId] = useState(null);
  const [bodyError, setBodyError] = useState('');
  const [storageError, setStorageError] = useState('');
  const importRef = useRef(null);

  // Bei jeder Änderung speichern
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions, bodyLog, goals })); setStorageError(''); }
    catch { setStorageError('Speichern im Gerätespeicher nicht möglich. Bitte Daten exportieren.'); }
  }, [sessions, bodyLog, goals]);

  // ----- Berechnungen -----
  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))),
    [sessions]
  );

  const weekSessions = useMemo(() => {
    const start = monday();
    return sessions.filter(s => s.date >= start && s.date <= today());
  }, [sessions]);

  const weekTotals = useMemo(() => {
    const sum = (k) => weekSessions.reduce((acc, s) => acc + (Number(s[k]) || 0), 0);
    const res = weekSessions.map(s => numberValue(s.resistance)).filter(v => v !== null && Number.isFinite(v));
    return {
      calories: sum('calories'),
      distance: sum('distance'),
      resistance: res.length ? res.reduce((a, b) => a + b, 0) / res.length : 0,
    };
  }, [weekSessions]);

  const progress = (metric) => {
    const goal = goals[metric] || 1;
    return Math.min((weekTotals[metric] / goal) * 100, 100);
  };

  const goalStatus = (p) => {
    if (p >= 100) return 'Ziel erreicht! 🎯';
    if (p >= 75) return 'Sehr nah dran! 💪';
    if (p >= 50) return 'Auf gutem Weg 🔥';
    return 'Anfang gemacht ✨';
  };

  // ----- Scanner (Kamera / Galerie) -----
  const handleScanFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // erlaubt erneutes Auswählen derselben Datei
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 10_000_000) { setScanError('Bitte ein Bild mit maximal 10 MB auswählen.'); return; }

    setScanning(true);
    setScanError('');
    setScanOk(false);
    setScanText('');
    try {
      const { extracted, rawText } = await extractFromImage(file);
      setScanText(rawText);
      const mapped = mapExtractedToForm(extracted);
      const fields = Object.fromEntries(Object.entries(mapped).filter(([, v]) => v !== ''));
      setForm(f => ({ ...f, ...fields }));
      setScanOk(true);
    } catch (err) {
      setScanError(`Scan fehlgeschlagen: ${err.message}. Bitte manuell eintragen.`);
    } finally {
      setScanning(false);
    }
  };

  // ----- Training speichern -----
  const saveTraining = () => {
    if (!validDate(form.date) || form.date > today()) { setFormError('Bitte ein gültiges Datum bis einschließlich heute auswählen.'); return; }
    const required = ['duration', 'calories', 'distance'];
    if (required.some(k => form[k] === '')) { setFormError('Bitte mindestens Dauer, Kalorien und Distanz ausfüllen.'); return; }
    const numeric = ['duration','calories','distance','resistance','heartRate','watts','speed','upm','mets','maxSpeed','maxWatts'];
    if (numeric.some(k => form[k] !== '' && (!Number.isFinite(numberValue(form[k])) || numberValue(form[k]) < 0))) { setFormError('Bitte nur gültige, nicht negative Zahlen eingeben.'); return; }
    if (numberValue(form.duration) <= 0 || numberValue(form.distance) <= 0 || numberValue(form.calories) < 0) { setFormError('Dauer und Distanz müssen größer als null sein.'); return; }
    if (numberValue(form.heartRate) > 250 || numberValue(form.speed) > 100 || numberValue(form.resistance) > 100) { setFormError('Mindestens ein Wert liegt außerhalb des plausiblen Bereichs.'); return; }
    const num = numberValue;
    const session = {
      id: editingId || uid(),
      date: form.date || today(),
      duration: num(form.duration),
      calories: num(form.calories),
      distance: num(form.distance),
      resistance: num(form.resistance),
      heartRate: num(form.heartRate),
      watts: num(form.watts),
      speed: num(form.speed),
      upm: num(form.upm),
      mets: num(form.mets),
      maxSpeed: num(form.maxSpeed),
      maxWatts: num(form.maxWatts),
    };
    setSessions(prev => editingId ? prev.map(s => s.id === editingId ? session : s) : [session, ...prev]);
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: today() });
    setFormError('');
    setScanOk(false);
    setTab('dashboard');
  };

  const deleteSession = (id) => { if (window.confirm('Dieses Training wirklich löschen?')) setSessions(prev => prev.filter(s => s.id !== id)); };
  const editSession = (s) => { setForm({ ...EMPTY_FORM, ...Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, s[k] == null ? '' : String(s[k])])) }); setEditingId(s.id); setFormError(''); setTab('add'); };
  const exportData = () => { const blob = new Blob([JSON.stringify({ version: 4, sessions, bodyLog, goals }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `crosstrainer-backup-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const importData = async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 5_000_000) throw new Error('Datei ist zu groß.'); const data = JSON.parse(await file.text()); if (!Array.isArray(data.sessions) || !Array.isArray(data.bodyLog)) throw new Error('Ungültiges Backup-Format'); if (data.sessions.some(s => !s || !validDate(s.date) || !['string','number'].includes(typeof s.id) || !Number.isFinite(Number(s.duration)) || Number(s.duration) <= 0 || !Number.isFinite(Number(s.distance)) || Number(s.distance) < 0 || !Number.isFinite(Number(s.calories)) || Number(s.calories) < 0)) throw new Error('Ungültige Trainingsdaten'); if (data.bodyLog.some(b => !b || !validDate(b.date))) throw new Error('Ungültige Körperdaten'); if (!window.confirm('Vorhandene Daten durch dieses Backup ersetzen? Vorher am besten exportieren.')) return; setSessions(data.sessions); setBodyLog(data.bodyLog); if (data.goals && ['calories','distance','resistance'].every(k => Number.isFinite(Number(data.goals[k])) && Number(data.goals[k]) > 0)) setGoals(data.goals); setStorageError(''); } catch (err) { setStorageError(`Import fehlgeschlagen: ${err.message}`); } };

  const saveBody = () => {
    if (!body.weight && !body.bodyFat && !body.muscle) { setBodyError('Bitte mindestens einen Wert eingeben.'); return; }
    if (Object.values(body).some(v => v !== '' && (!Number.isFinite(numberValue(v)) || numberValue(v) < 0)) || (body.bodyFat !== '' && numberValue(body.bodyFat) > 100) || (body.weight !== '' && numberValue(body.weight) <= 0)) { setBodyError('Bitte gültige Körperwerte eingeben.'); return; }
    setBodyError('');
    setBodyLog(prev => [{ id: uid(), date: today(), ...body }, ...prev]);
    setBody({ weight: '', bodyFat: '', muscle: '' });
  };

  const inputCls = 'w-full bg-[#111d31] border border-[#34445d] rounded-xl px-3 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300/50 focus:border-teal-300';

  // ----- Render-Funktionen (keine Komponenten, damit Eingabefelder den Fokus behalten) -----
  const renderDashboard = () => {
    const last7 = sorted.slice(0, 7).reverse();
    const maxCal = Math.max(...last7.map(s => s.calories || 0), 1);
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#172a37] border border-teal-300/20 rounded-lg p-4 text-center">
            <Zap className="w-5 h-5 mx-auto mb-2 text-teal-300" />
            <div className="text-2xl font-bold text-teal-200">{Math.round(weekTotals.calories)}</div>
            <div className="text-xs text-gray-400">kcal / 7 Tage</div>
          </div>
          <div className="bg-[#172b3d] border border-cyan-300/20 rounded-lg p-4 text-center">
            <Navigation className="w-5 h-5 mx-auto mb-2 text-sky-300" />
            <div className="text-2xl font-bold text-sky-200">{weekTotals.distance.toFixed(1)}</div>
            <div className="text-xs text-gray-400">km / 7 Tage</div>
          </div>
          <div className="bg-[#29213e] border border-violet-300/20 rounded-lg p-4 text-center">
            <Gauge className="w-5 h-5 mx-auto mb-2 text-violet-300" />
            <div className="text-2xl font-bold text-violet-200">{weekTotals.resistance.toFixed(1)}</div>
            <div className="text-xs text-gray-400">Ø Widerstand</div>
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="bg-[#17243a]/90 border border-white/10 rounded-2xl p-4">
            <h3 className="font-semibold text-gray-100 mb-3">Kalorien letzte Trainings</h3>
            <div className="flex items-end gap-1 h-24">
              {last7.map(s => (
                <div
                  key={s.id}
                  className="flex-1 bg-teal-400 rounded-t opacity-80"
                  style={{ height: `${((s.calories || 0) / maxCal) * 100}%`, minHeight: '4px' }}
                  title={`${s.date}: ${s.calories} kcal`}
                />
              ))}
            </div>
          </div>
        )}

        {sorted[0] && (
          <div className="bg-[#17243a]/90 border border-white/10 rounded-2xl p-4">
            <h3 className="font-semibold text-gray-100 mb-3 flex items-center gap-2"><Activity className="w-4 h-4" /> Letztes Training</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-gray-500">Datum</div><div className="font-bold text-gray-100">{sorted[0].date}</div></div>
              <div><div className="text-gray-500">Dauer</div><div className="font-bold text-green-400">{sorted[0].duration} min</div></div>
              <div><div className="text-gray-500">Kalorien</div><div className="font-bold text-teal-300">{sorted[0].calories} kcal</div></div>
              <div><div className="text-gray-500">Distanz</div><div className="font-bold text-sky-300">{sorted[0].distance} km</div></div>
              <div><div className="text-gray-500">Widerstand</div><div className="font-bold text-violet-300">{sorted[0].resistance ?? '–'}</div></div>
              <div><div className="text-gray-500">Watt Ø</div><div className="font-bold text-yellow-400">{sorted[0].watts ?? '–'} W</div></div>
            </div>
          </div>
        )}

        {sessions.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-8">Noch keine Trainings. Tippe unten auf „Hinzu“ und scanne dein Display.</p>
        )}
      </div>
    );
  };

  const renderHistory = () => (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-gray-100">Trainingshistorie</h2>
      {sorted.length === 0 && <p className="text-gray-500 text-sm">Noch keine Einträge.</p>}
      {sorted.map(s => (
        <div key={s.id} className="bg-[#17243a]/90 border border-white/10 rounded-2xl p-3">
          <div className="flex justify-between items-start mb-2">
            <div className="font-semibold text-gray-100">{s.date}</div>
            <button onClick={() => editSession(s)} aria-label="Training bearbeiten" className="text-teal-300 p-1"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => deleteSession(s.id)} className="text-gray-500 hover:text-red-400 p-1" aria-label="Training löschen">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-gray-500">Dauer </span><span className="text-gray-100">{s.duration} min</span></div>
            <div><span className="text-gray-500">Kalorien </span><span className="text-teal-300">{s.calories} kcal</span></div>
            <div><span className="text-gray-500">Distanz </span><span className="text-sky-300">{s.distance} km</span></div>
            <div><span className="text-gray-500">Widerstand </span><span className="text-violet-300">{s.resistance ?? '–'}</span></div>
            <div><span className="text-gray-500">Puls </span><span className="text-red-400">{s.heartRate ?? '–'}</span></div>
            <div><span className="text-gray-500">Watt </span><span className="text-yellow-400">{s.watts ?? '–'}</span></div>
            <div><span className="text-gray-500">Speed Ø </span><span className="text-gray-100">{s.speed ?? '–'} km/h</span></div>
            <div><span className="text-gray-500">Max Speed </span><span className="text-gray-100">{s.maxSpeed ?? '–'} km/h</span></div>
            <div><span className="text-gray-500">UPM </span><span className="text-gray-100">{s.upm ?? '–'}</span></div>
            <div><span className="text-gray-500">METs </span><span className="text-gray-100">{s.mets ?? '–'}</span></div>
            <div><span className="text-gray-500">Max Watt </span><span className="text-gray-100">{s.maxWatts ?? '–'}</span></div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderStats = () => {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - (chartPeriod === 'year' ? 11 : 2), 1);
    const filtered = sessions.filter(s => new Date(`${s.date}T12:00:00`) >= cutoff && s.date <= today());
    const grouped = new Map();
    filtered.forEach(s => {
      const key = chartPeriod === 'year' ? s.date.slice(0, 7) : s.date;
      const entry = grouped.get(key) || { calories: 0, distance: 0, duration: 0, heartRateSum: 0, heartRateCount: 0, count: 0 };
      entry.calories += Number(s.calories) || 0;
      entry.distance += Number(s.distance) || 0;
      entry.duration += Number(s.duration) || 0;
      const hr = numberValue(s.heartRate);
      if (hr !== null && Number.isFinite(hr) && hr > 0) { entry.heartRateSum += hr; entry.heartRateCount++; }
      entry.count++;
      grouped.set(key, entry);
    });
    const points = [...grouped.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, value: chartMetric === 'heartRate' ? (v.heartRateCount ? v.heartRateSum / v.heartRateCount : null) : v[chartMetric] }));
    const visible = points.filter(p => p.value !== null);
    const max = Math.max(1, ...visible.map(p => p.value));
    const total = filtered.reduce((n,s) => n + (Number(s.calories) || 0), 0);
    const best = sessions.length ? Math.max(...sessions.map(s => Number(s.distance) || 0)) : 0;
    return <div className="space-y-4">
      <h2 className="text-xl font-bold flex items-center gap-2"><TrendingUp className="text-teal-300" /> Fitness-Statistiken</h2>
      <div className="grid grid-cols-2 gap-3"><div className="bg-[#17243a] rounded-2xl p-4"><div className="text-slate-400 text-xs">Trainings im Zeitraum</div><div className="text-2xl font-bold text-teal-300">{filtered.length}</div></div><div className="bg-[#17243a] rounded-2xl p-4"><div className="text-slate-400 text-xs">Persönlicher Distanzrekord</div><div className="text-2xl font-bold text-violet-300">{best.toFixed(2)} km</div></div></div>
      <div className="bg-[#17243a] rounded-2xl p-4 space-y-4 border border-white/10">
        <div className="flex gap-2 flex-wrap"><select aria-label="Messwert" className={inputCls} value={chartMetric} onChange={e=>setChartMetric(e.target.value)}><option value="calories">Kalorien</option><option value="distance">Distanz</option><option value="duration">Dauer</option><option value="heartRate">Durchschnittspuls</option></select><select aria-label="Zeitraum" className={inputCls} value={chartPeriod} onChange={e=>setChartPeriod(e.target.value)}><option value="month">Letzte 3 Kalendermonate · täglich</option><option value="year">Letzte 12 Kalendermonate · monatlich</option></select></div>
        {visible.length ? <><div className="text-sm text-slate-400">{chartMetric === 'heartRate' ? 'Durchschnitt der gemeldeten Trainingspulse' : 'Summe je Tag bzw. Monat'}</div><div className="flex items-end gap-1 h-44 overflow-x-auto pb-1" role="img" aria-label={`Diagramm ${chartMetric} mit ${visible.length} Datenpunkten`}>{visible.map(p=><div key={p.date} title={`${p.date}: ${p.value.toFixed(1)}`} className="min-w-[10px] flex-1 flex flex-col justify-end h-full"><div className="bg-gradient-to-t from-teal-600 to-cyan-300 rounded-t-md min-h-[3px]" style={{height:`${Math.max(2, p.value/max*100)}%`}} /></div>)}</div><div className="flex justify-between text-xs text-slate-400"><span>{visible[0].date}</span><span>{visible[visible.length-1].date}</span></div></> : <p className="text-slate-400 text-sm">Für diesen Messwert liegen noch keine Daten vor.</p>}
      </div>
      <div className="bg-[#17243a] rounded-2xl p-4"><p className="text-slate-400 text-sm">Kalorien im gewählten Zeitraum</p><p className="text-2xl font-bold text-teal-300">{Math.round(total).toLocaleString('de-DE')} kcal</p></div>
    </div>;
  };

  const renderGoals = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2"><Target className="w-5 h-5" /> Wochenziele</h2>
      <p className="text-xs text-gray-400">Aktuelle Kalenderwoche (Montag bis heute)</p>
      {['calories', 'distance', 'resistance'].map(metric => {
        const p = progress(metric);
        const c = COLORS[metric];
        const unit = metric === 'calories' ? 'kcal' : metric === 'distance' ? 'km' : '';
        return (
          <div key={metric} className={`${c.card} border rounded-lg p-4`}>
            <div className="flex justify-between items-center mb-2">
              <div>
                <div className="font-semibold text-gray-100">{METRIC_LABELS[metric]}</div>
                <div className="text-sm text-gray-400">
                  {weekTotals[metric].toFixed(metric === 'calories' ? 0 : 1)} / {goals[metric]} {unit}
                </div>
                <div className="text-xs text-gray-400 mt-1">{goalStatus(p)}</div>
              </div>
              <div className={`text-2xl font-bold ${c.text}`}>{p.toFixed(0)}%</div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div className={`h-full ${c.bar} transition-all duration-500`} style={{ width: `${p}%` }} />
            </div>
          </div>
        );
      })}
      <div className="bg-[#17243a] rounded-2xl p-4 space-y-3 border border-white/10">
        <h3 className="font-semibold">Eigene Wochenziele</h3>
        {Object.entries(METRIC_LABELS).map(([k, label]) => <label key={k} className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><input className={`${inputCls} max-w-32`} type="number" min="0.1" step="0.1" aria-label={`Ziel ${label}`} value={goals[k]} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) setGoals(g => ({...g, [k]: v})); }} /></label>)}
      </div>
    </div>
  );

  const renderAdd = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2"><Plus className="w-5 h-5" /> {editingId ? 'Training bearbeiten' : 'Training hinzufügen'}</h2>

      {/* Kamera & Galerie */}
      <div className="bg-cyan-900/20 border border-cyan-700/50 rounded-lg p-4 space-y-3">
        <p className="text-xs text-slate-300">Lokale Texterkennung (OCR): Das Foto bleibt auf deinem Gerät. Beim ersten Scan ist Internet zum Laden der Erkennung nötig. Nur eindeutig erkannte Werte werden übernommen.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className={`flex items-center justify-center gap-2 font-bold py-3 rounded-lg cursor-pointer transition ${scanning ? 'bg-gray-600 text-gray-300 pointer-events-none' : 'bg-gradient-to-r from-teal-500 to-indigo-500 text-white hover:from-teal-400 hover:to-indigo-400'}`}>
            <Camera className="w-5 h-5" /> Kamera
            <input type="file" accept="image/*" capture="environment" onChange={handleScanFile} className="hidden" />
          </label>
          <label className={`flex items-center justify-center gap-2 font-bold py-3 rounded-lg cursor-pointer transition ${scanning ? 'bg-gray-600 text-gray-300 pointer-events-none' : 'bg-gray-700 text-gray-100 hover:bg-gray-600'}`}>
            <Image className="w-5 h-5" /> Galerie
            <input type="file" accept="image/*" onChange={handleScanFile} className="hidden" />
          </label>
        </div>

        {scanning && (
          <div className="flex items-center gap-2 text-sm text-sky-200">
            <Loader2 className="w-4 h-4 animate-spin" /> Display wird ausgelesen…
          </div>
        )}
        {scanOk && !scanning && (
          <div className="flex items-center gap-2 text-sm text-green-300">
            <Check className="w-4 h-4" /> Werte übernommen. Bitte kurz prüfen und speichern.
          </div>
        )}
        {scanText && <details className="text-xs text-slate-300"><summary className="cursor-pointer">Erkannten Rohtext prüfen</summary><pre className="whitespace-pre-wrap mt-2 max-h-40 overflow-auto">{scanText}</pre></details>}
        {scanError && (
          <div className="flex items-start gap-2 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5" /> {scanError}
          </div>
        )}
      </div>

      {/* Formular */}
      <div className="bg-[#17243a]/90 border border-white/10 rounded-2xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-300 mb-1">Datum</label>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            ['duration', 'Dauer (min) *', 'number'],
            ['calories', 'Kalorien (kcal) *', 'number'],
            ['distance', 'Distanz (km) *', 'number'],
            ['resistance', 'Ø Widerstand', 'number'],
          ].map(([key, label, type]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-300 mb-1">{label}</label>
              <input type={type} step="0.01" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className={inputCls} />
            </div>
          ))}
        </div>

        <div className="border-t border-gray-700 pt-3">
          <p className="text-xs font-semibold text-gray-400 mb-3">Weitere Werte (optional)</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['speed', 'Ø Geschw. (km/h)'], ['maxSpeed', 'Max Geschw. (km/h)'],
              ['watts', 'Ø Watt'], ['maxWatts', 'Max Watt'],
              ['heartRate', 'Ø Herzfrequenz'], ['upm', 'UPM Ø'], ['mets', 'METs Ø'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
                <input type="number" step="0.01" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className={inputCls} />
              </div>
            ))}
          </div>
        </div>

        {formError && <p className="text-sm text-red-300">{formError}</p>}

        <button onClick={saveTraining} className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition">
          {editingId ? 'Änderungen speichern' : 'Training speichern'}
        </button>
        {editingId && <button className="w-full text-slate-300 py-2" onClick={() => { setEditingId(null); setForm({...EMPTY_FORM, date: today()}); }}>Bearbeitung abbrechen</button>}
      </div>
    </div>
  );

  const renderBody = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2"><User className="w-5 h-5" /> Körpermessungen</h2>
      <div className="bg-[#17243a]/90 border border-white/10 rounded-2xl p-4 space-y-3">
        {[
          ['weight', 'Gewicht (kg)'], ['bodyFat', 'Körperfett (%)'], ['muscle', 'Muskelmasse (kg)'],
        ].map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-semibold text-gray-300 mb-1">{label}</label>
            <input type="number" step="0.1" value={body[key]} onChange={e => setBody({ ...body, [key]: e.target.value })} className={inputCls} />
          </div>
        ))}
        {bodyError && <p role="alert" className="text-rose-300 text-sm">{bodyError}</p>}
        <button onClick={saveBody} className="w-full bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-500 hover:to-indigo-400 text-white font-bold py-2 rounded-lg transition">
          Speichern
        </button>
      </div>
      {bodyLog.length > 0 && (
        <div className="space-y-2">
          {bodyLog.map(b => (
            <div key={b.id} className="bg-[#17243a]/90 border border-white/10 rounded-2xl p-3 text-sm grid grid-cols-5 gap-2">
              <div className="text-gray-400">{b.date}</div>
              <div><span className="text-gray-500 text-xs block">Gewicht</span>{b.weight || '–'}</div>
              <div><span className="text-gray-500 text-xs block">Fett</span>{b.bodyFat || '–'}</div>
              <div><span className="text-gray-500 text-xs block">Muskel</span>{b.muscle || '–'}</div>
              <button aria-label="Körpermessung löschen" onClick={() => { if(window.confirm('Messung löschen?')) setBodyLog(prev => prev.filter(x => x.id !== b.id)); }}><Trash2 className="w-4 h-4 text-rose-300" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const TABS = [
    { id: 'dashboard', icon: Activity, label: 'Dashboard', render: renderDashboard },
    { id: 'history', icon: Calendar, label: 'Historie', render: renderHistory },
    { id: 'goals', icon: Target, label: 'Ziele', render: renderGoals },
    { id: 'stats', icon: TrendingUp, label: 'Statistik', render: renderStats },
    { id: 'add', icon: Plus, label: 'Hinzu', render: renderAdd },
    { id: 'body', icon: User, label: 'Body', render: renderBody },
  ];
  const current = TABS.find(t => t.id === tab);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#080f20] via-[#111b32] to-[#091321] text-slate-100">
      <div className="relative max-w-2xl mx-auto px-4 pb-28 pt-6">
        <div className="mb-6">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-cyan-300 to-violet-300">Crosstrainer Pro <span className="text-sm align-top text-teal-300">V5</span></h1>
          <p className="text-sm text-slate-400">MIDNIGHT PERFORMANCE · Dein Training im Blick</p>
          <div className="flex gap-2 mt-4"><button onClick={exportData} className="flex items-center gap-2 text-xs bg-[#21334c] rounded-xl px-3 py-2"><Download className="w-4 h-4" /> Backup</button><button onClick={() => importRef.current?.click()} className="flex items-center gap-2 text-xs bg-[#21334c] rounded-xl px-3 py-2"><Upload className="w-4 h-4" /> Import</button><input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={importData} /></div>
          {storageError && <p role="alert" className="text-rose-300 text-sm mt-2">{storageError}</p>}
        </div>

        {current.render()}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a1426]/95 border-t border-[#34445d] backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-2 py-2 grid grid-cols-6 gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg transition ${active ? 'bg-teal-300/15 text-teal-300' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
