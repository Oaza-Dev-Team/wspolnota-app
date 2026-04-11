import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Edit2, Trash2, LogIn, RefreshCw, ChevronDown, Users, Church, Phone, Mail, Hash, User } from 'lucide-react';
import { fetchMembers, addMember, updateMember, deleteMember } from './utils/googleSheets';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Wypełnij te dane po skonfigurowaniu Google Cloud Project
const DEFAULT_CONFIG = {
  clientId: '',       // Twój Google OAuth Client ID
  spreadsheetId: '',  // ID arkusza Google Sheets
};

// ─── STYLE ───────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --cream: #f7f3ee;
    --warm-white: #faf8f5;
    --ink: #1a1714;
    --ink-soft: #4a4540;
    --ink-faint: #9a948e;
    --gold: #b8860b;
    --gold-light: #d4a017;
    --gold-pale: #f0e6c8;
    --border: #e0d8ce;
    --shadow: rgba(26,23,20,0.08);
    --red: #c0392b;
  }

  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--cream);
    color: var(--ink);
    min-height: 100vh;
  }

  .app { min-height: 100vh; display: flex; flex-direction: column; }

  /* HEADER */
  .header {
    background: var(--ink);
    padding: 0 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .header-brand {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.5rem;
    color: var(--gold-light);
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .header-brand span { color: #fff; font-weight: 400; font-style: italic; }
  .header-right { display: flex; align-items: center; gap: 1rem; }
  .header-count {
    font-size: 0.8rem;
    color: var(--ink-faint);
    background: rgba(255,255,255,0.07);
    padding: 0.3rem 0.7rem;
    border-radius: 20px;
    color: #ccc;
  }

  /* SETUP SCREEN */
  .setup-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  .setup-card {
    background: var(--warm-white);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 2.5rem;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 4px 24px var(--shadow);
  }
  .setup-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.8rem;
    font-weight: 600;
    margin-bottom: 0.4rem;
  }
  .setup-sub {
    color: var(--ink-soft);
    font-size: 0.9rem;
    margin-bottom: 2rem;
    line-height: 1.5;
  }
  .setup-link {
    color: var(--gold);
    text-decoration: underline;
    cursor: pointer;
  }

  /* FORM ELEMENTS */
  .field { margin-bottom: 1.2rem; }
  .field label {
    display: block;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--ink-soft);
    margin-bottom: 0.4rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .field input, .field select, .field textarea {
    width: 100%;
    padding: 0.65rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.95rem;
    background: #fff;
    color: var(--ink);
    outline: none;
    transition: border-color 0.15s;
  }
  .field input:focus, .field select:focus, .field textarea:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 3px var(--gold-pale);
  }
  .field textarea { resize: vertical; min-height: 80px; }

  /* BUTTONS */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border-radius: 8px;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.15s;
  }
  .btn-primary {
    background: var(--ink);
    color: #fff;
  }
  .btn-primary:hover { background: #2d2926; }
  .btn-gold {
    background: var(--gold);
    color: #fff;
  }
  .btn-gold:hover { background: var(--gold-light); }
  .btn-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--ink-soft);
  }
  .btn-outline:hover { border-color: var(--ink-soft); color: var(--ink); }
  .btn-danger { background: var(--red); color: #fff; }
  .btn-danger:hover { background: #a93226; }
  .btn-sm { padding: 0.4rem 0.8rem; font-size: 0.82rem; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-full { width: 100%; justify-content: center; }

  /* MAIN LAYOUT */
  .main { flex: 1; padding: 2rem; max-width: 1200px; margin: 0 auto; width: 100%; }

  /* TOOLBAR */
  .toolbar {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .search-wrap {
    flex: 1;
    min-width: 200px;
    position: relative;
  }
  .search-wrap svg {
    position: absolute;
    left: 0.9rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-faint);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    padding: 0.65rem 0.9rem 0.65rem 2.5rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.95rem;
    background: #fff;
    outline: none;
    transition: border-color 0.15s;
  }
  .search-input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px var(--gold-pale); }

  .filter-select {
    padding: 0.65rem 2rem 0.65rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.9rem;
    background: #fff;
    outline: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a948e' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.7rem center;
    transition: border-color 0.15s;
  }
  .filter-select:focus { border-color: var(--gold); }

  /* STATS BAR */
  .stats-bar {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .stat-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--warm-white);
    border: 1px solid var(--border);
    border-radius: 20px;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .stat-pill strong { color: var(--ink); }

  /* TABLE */
  .table-wrap {
    background: var(--warm-white);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 12px var(--shadow);
  }
  table { width: 100%; border-collapse: collapse; }
  thead { background: var(--ink); }
  th {
    padding: 0.85rem 1rem;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #ccc;
  }
  tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: var(--gold-pale); }
  td { padding: 0.9rem 1rem; font-size: 0.9rem; vertical-align: middle; }
  .td-name { font-weight: 500; }
  .td-muted { color: var(--ink-soft); }
  .td-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    background: var(--gold-pale);
    border: 1px solid #d4c48a;
    border-radius: 12px;
    font-size: 0.78rem;
    color: var(--gold);
    font-weight: 500;
  }
  .td-actions { display: flex; gap: 0.5rem; }
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    cursor: pointer;
    color: var(--ink-soft);
    transition: all 0.15s;
  }
  .icon-btn:hover { background: var(--ink); color: #fff; border-color: var(--ink); }
  .icon-btn.danger:hover { background: var(--red); border-color: var(--red); }

  /* EMPTY STATE */
  .empty {
    padding: 4rem 2rem;
    text-align: center;
    color: var(--ink-faint);
  }
  .empty-icon { margin: 0 auto 1rem; opacity: 0.3; }
  .empty h3 { font-family: 'Cormorant Garamond', serif; font-size: 1.4rem; margin-bottom: 0.5rem; color: var(--ink-soft); }

  /* MODAL */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(26,23,20,0.6);
    backdrop-filter: blur(4px);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .modal {
    background: var(--warm-white);
    border-radius: 16px;
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.5rem 0;
    margin-bottom: 1.5rem;
  }
  .modal-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.5rem;
    font-weight: 600;
  }
  .modal-body { padding: 0 1.5rem 1.5rem; }
  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
    margin-top: 1rem;
  }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

  /* TOAST */
  .toast {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: var(--ink);
    color: #fff;
    padding: 0.8rem 1.2rem;
    border-radius: 10px;
    font-size: 0.9rem;
    z-index: 300;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    animation: slideUp 0.3s ease;
  }
  .toast.success { border-left: 3px solid #27ae60; }
  .toast.error { border-left: 3px solid var(--red); }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  /* LOADING */
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    color: var(--ink-faint);
    gap: 0.75rem;
  }
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* RESPONSIVE */
  @media (max-width: 768px) {
    .main { padding: 1rem; }
    .form-row { grid-template-columns: 1fr; }
    table { font-size: 0.82rem; }
    th, td { padding: 0.7rem 0.6rem; }
    .hide-mobile { display: none; }
  }
`;

// ─── EMPTY MEMBER ─────────────────────────────────────────────────────────────
const emptyMember = () => ({
  imie_meza: '', imie_zony: '', nazwisko: '',
  parafia: '', numer_kregu: '', email: '', telefon: '', notatki: '',
});

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return <div className={`toast ${type}`}>{message}</div>;
}

function MemberModal({ member, onSave, onClose, saving }) {
  const [form, setForm] = useState(member || emptyMember());
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const isEdit = !!member?.id !== undefined && member?._rowIndex;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Edytuj małżeństwo' : 'Dodaj małżeństwo'}</div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="field">
              <label>Imię męża</label>
              <input value={form.imie_meza} onChange={set('imie_meza')} placeholder="Jan" />
            </div>
            <div className="field">
              <label>Imię żony</label>
              <input value={form.imie_zony} onChange={set('imie_zony')} placeholder="Maria" />
            </div>
          </div>
          <div className="field">
            <label>Nazwisko</label>
            <input value={form.nazwisko} onChange={set('nazwisko')} placeholder="Kowalski" />
          </div>
          <div className="form-row">
            <div className="field">
              <label>Parafia</label>
              <input value={form.parafia} onChange={set('parafia')} placeholder="Parafia pw. ..." />
            </div>
            <div className="field">
              <label>Numer kręgu</label>
              <input value={form.numer_kregu} onChange={set('numer_kregu')} placeholder="np. K-03" />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>E-mail</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="jan@example.com" />
            </div>
            <div className="field">
              <label>Telefon</label>
              <input type="tel" value={form.telefon} onChange={set('telefon')} placeholder="+48 600 000 000" />
            </div>
          </div>
          <div className="field">
            <label>Notatki</label>
            <textarea value={form.notatki} onChange={set('notatki')} placeholder="Opcjonalne uwagi..." />
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
            <button className="btn btn-gold" onClick={() => onSave(form)} disabled={saving || !form.nazwisko}>
              {saving ? 'Zapisuję...' : (isEdit ? 'Zapisz zmiany' : 'Dodaj')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupScreen({ onConnect }) {
  const [clientId, setClientId] = useState(localStorage.getItem('ws_clientId') || '');
  const [spreadsheetId, setSpreadsheetId] = useState(localStorage.getItem('ws_spreadsheetId') || '');

  const handleSave = () => {
    localStorage.setItem('ws_clientId', clientId);
    localStorage.setItem('ws_spreadsheetId', spreadsheetId);
    onConnect({ clientId, spreadsheetId });
  };

  return (
    <div className="setup-wrap">
      <div className="setup-card">
        <div className="setup-title">Konfiguracja połączenia</div>
        <div className="setup-sub">
          Aby uruchomić aplikację, potrzebujesz Google Cloud Project z włączonym Sheets API i OAuth 2.0.{' '}
          <a className="setup-link" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">
            Otwórz Google Cloud Console →
          </a>
        </div>
        <div className="field">
          <label>Google OAuth Client ID</label>
          <input
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder="123456789-xxx.apps.googleusercontent.com"
          />
        </div>
        <div className="field">
          <label>ID arkusza Google Sheets</label>
          <input
            value={spreadsheetId}
            onChange={e => setSpreadsheetId(e.target.value)}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          />
        </div>
        <div style={{ marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--ink-faint)', lineHeight: 1.6 }}>
          ID arkusza to część URL: docs.google.com/spreadsheets/d/<strong>[TO JEST ID]</strong>/edit
        </div>
        <button
          className="btn btn-primary btn-full"
          onClick={handleSave}
          disabled={!clientId || !spreadsheetId}
        >
          <LogIn size={16} /> Połącz z Google Sheets
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [config, setConfig] = useState(() => ({
    clientId: localStorage.getItem('ws_clientId') || DEFAULT_CONFIG.clientId,
    spreadsheetId: localStorage.getItem('ws_spreadsheetId') || DEFAULT_CONFIG.spreadsheetId,
  }));
  const [accessToken, setAccessToken] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterKrag, setFilterKrag] = useState('');
  const [filterParafia, setFilterParafia] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | member object
  const [toast, setToast] = useState(null);
  const [showSetup, setShowSetup] = useState(!config.clientId || !config.spreadsheetId);

  const showToast = (message, type = 'success') => setToast({ message, type });

  // Load members after auth
  const loadMembers = async (token, cfg) => {
    setLoading(true);
    try {
      const data = await fetchMembers((cfg || config).spreadsheetId, token);
      setMembers(data);
    } catch (e) {
      showToast('Błąd pobierania danych: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (cfg) => {
    setConfig(cfg);
    setShowSetup(false);
    setLoading(true);
    try {
      // Dynamically load Google Identity Services
      await new Promise((resolve, reject) => {
        if (window.google?.accounts) return resolve();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        callback: async (resp) => {
          if (resp.error) { showToast('Błąd logowania Google', 'error'); setLoading(false); return; }
          setAccessToken(resp.access_token);
          await loadMembers(resp.access_token, cfg);
        },
      });
      tokenClient.requestAccessToken();
    } catch (e) {
      showToast('Nie udało się załadować Google Auth', 'error');
      setLoading(false);
    }
  };

  // Derived lists for filters
  const kregi = useMemo(() => [...new Set(members.map(m => m.numer_kregu).filter(Boolean))].sort(), [members]);
  const parafie = useMemo(() => [...new Set(members.map(m => m.parafia).filter(Boolean))].sort(), [members]);

  // Filtered members
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return members.filter(m => {
      const matchSearch = !q || [m.imie_meza, m.imie_zony, m.nazwisko, m.parafia, m.numer_kregu, m.email, m.telefon]
        .some(v => v.toLowerCase().includes(q));
      const matchKrag = !filterKrag || m.numer_kregu === filterKrag;
      const matchParafia = !filterParafia || m.parafia === filterParafia;
      return matchSearch && matchKrag && matchParafia;
    });
  }, [members, search, filterKrag, filterParafia]);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (form._rowIndex) {
        await updateMember(config.spreadsheetId, accessToken, form);
        setMembers(ms => ms.map(m => m._rowIndex === form._rowIndex ? { ...form } : m));
        showToast('Zaktualizowano pomyślnie');
      } else {
        await addMember(config.spreadsheetId, accessToken, form);
        await loadMembers(accessToken);
        showToast('Dodano nowego członka');
      }
      setModal(null);
    } catch (e) {
      showToast('Błąd zapisu: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (member) => {
    if (!window.confirm(`Usunąć ${member.imie_meza} i ${member.imie_zony} ${member.nazwisko}?`)) return;
    try {
      await deleteMember(config.spreadsheetId, accessToken, member._rowIndex);
      setMembers(ms => ms.filter(m => m._rowIndex !== member._rowIndex));
      showToast('Usunięto');
    } catch (e) {
      showToast('Błąd usuwania: ' + e.message, 'error');
    }
  };

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* HEADER */}
        <header className="header">
          <div className="header-brand">
            Wspólnota <span>/ lista członków</span>
          </div>
          <div className="header-right">
            {accessToken && (
              <div className="header-count">
                {filtered.length} / {members.length} małżeństw
              </div>
            )}
            {accessToken && (
              <button className="btn btn-outline btn-sm" style={{ color: '#ccc', borderColor: '#444' }} onClick={() => loadMembers(accessToken)}>
                <RefreshCw size={14} /> Odśwież
              </button>
            )}
            <button className="btn btn-outline btn-sm" style={{ color: '#ccc', borderColor: '#444' }} onClick={() => setShowSetup(true)}>
              Ustawienia
            </button>
          </div>
        </header>

        {/* SETUP SCREEN */}
        {showSetup && <SetupScreen onConnect={handleConnect} />}

        {/* MAIN */}
        {!showSetup && (
          <main className="main">
            {!accessToken && !loading && (
              <div className="empty">
                <div className="empty-icon"><Users size={48} /></div>
                <h3>Połącz się z Google Sheets</h3>
                <p>Kliknij „Ustawienia" i podaj dane konfiguracyjne.</p>
              </div>
            )}

            {loading && (
              <div className="loading">
                <div className="spinner" />
                Ładowanie danych...
              </div>
            )}

            {accessToken && !loading && (
              <>
                {/* STATS */}
                <div className="stats-bar">
                  <div className="stat-pill"><Users size={14} /><strong>{members.length}</strong> małżeństw łącznie</div>
                  <div className="stat-pill"><Hash size={14} /><strong>{kregi.length}</strong> kręgów</div>
                  <div className="stat-pill"><Church size={14} /><strong>{parafie.length}</strong> parafii</div>
                </div>

                {/* TOOLBAR */}
                <div className="toolbar">
                  <div className="search-wrap">
                    <Search size={16} />
                    <input
                      className="search-input"
                      placeholder="Szukaj po nazwisku, parafii, kręgu..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <select className="filter-select" value={filterKrag} onChange={e => setFilterKrag(e.target.value)}>
                    <option value="">Wszystkie kręgi</option>
                    {kregi.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select className="filter-select" value={filterParafia} onChange={e => setFilterParafia(e.target.value)}>
                    <option value="">Wszystkie parafie</option>
                    {parafie.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button className="btn btn-gold" onClick={() => setModal({ new: true })}>
                    <Plus size={16} /> Dodaj
                  </button>
                </div>

                {/* TABLE */}
                <div className="table-wrap">
                  {filtered.length === 0 ? (
                    <div className="empty">
                      <div className="empty-icon"><Users size={40} /></div>
                      <h3>Brak wyników</h3>
                      <p>Spróbuj zmienić filtry lub dodaj nowych członków.</p>
                    </div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Małżeństwo</th>
                          <th className="hide-mobile">Parafia</th>
                          <th>Krąg</th>
                          <th className="hide-mobile">Kontakt</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((m) => (
                          <tr key={m._rowIndex}>
                            <td>
                              <div className="td-name">
                                {m.imie_meza && m.imie_zony
                                  ? `${m.imie_meza} i ${m.imie_zony} ${m.nazwisko}`
                                  : `${m.imie_meza || m.imie_zony} ${m.nazwisko}`}
                              </div>
                            </td>
                            <td className="td-muted hide-mobile">{m.parafia}</td>
                            <td>{m.numer_kregu && <span className="td-badge">{m.numer_kregu}</span>}</td>
                            <td className="hide-mobile">
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                {m.email && <span className="td-muted" style={{ fontSize: '0.82rem' }}>✉ {m.email}</span>}
                                {m.telefon && <span className="td-muted" style={{ fontSize: '0.82rem' }}>📞 {m.telefon}</span>}
                              </div>
                            </td>
                            <td>
                              <div className="td-actions">
                                <button className="icon-btn" title="Edytuj" onClick={() => setModal(m)}>
                                  <Edit2 size={13} />
                                </button>
                                <button className="icon-btn danger" title="Usuń" onClick={() => handleDelete(m)}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </main>
        )}

        {/* MODAL */}
        {modal && (
          <MemberModal
            member={modal?.new ? null : modal}
            onSave={handleSave}
            onClose={() => setModal(null)}
            saving={saving}
          />
        )}

        {/* TOAST */}
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </>
  );
}
