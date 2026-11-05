import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { api } from '../services/api';

// ---- Toasts ----
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, message, type }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), type === 'error' ? 6500 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{t.message}</span>
            <button className="btn ghost icon" style={{ color: '#fff', padding: 2 }} onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} aria-label="Dismiss"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- Meta (categories, products, options) ----
const MetaCtx = createContext({ meta: null, reload: () => {} });
export const useMeta = () => useContext(MetaCtx);
export function MetaProvider({ children }) {
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(() => api.get('/meta').then((m) => { setMeta(m); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { reload(); }, [reload]);
  // Pages can rely on `meta` being loaded: block rendering until the lookup lists arrive.
  if (!meta) {
    return (
      <div className="center-pad" style={{ height: '100%' }}>
        {error ? <><div className="alert err" style={{ maxWidth: 480 }}>{error}</div><button className="btn primary" onClick={reload}>Retry</button></> : <><div className="spinner" /><span>Loading Consumer Insights Hub…</span></>}
      </div>
    );
  }
  return <MetaCtx.Provider value={{ meta, reload, error }}>{children}</MetaCtx.Provider>;
}

// ---- Data loading ----
export function useFetch(url, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!url) return Promise.resolve();
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    return api.get(url).then(
      (data) => { if (my === seq.current) setState({ data, loading: false, error: null }); },
      (e) => { if (my === seq.current) setState((s) => ({ ...s, loading: false, error: e.message })); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Remember list filters for the session so navigating back keeps them.
export function useSavedState(key, initial) {
  const [v, setV] = useState(() => { try { const s = sessionStorage.getItem(key); return s ? { ...initial, ...JSON.parse(s) } : initial; } catch { return initial; } });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }, [key, v]);
  return [v, setV];
}
