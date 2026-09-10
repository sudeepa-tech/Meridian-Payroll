import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, setUnauthorizedHandler } from '../lib/api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [settings, setSettings] = useState(null);
  const [country, setCountry] = useState('US');
  const [loading, setLoading] = useState(true);
  const [toast, setToastMsg] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  const refresh = useCallback(async () => {
    const [c, cur, s] = await Promise.all([api.settings.countries(), api.settings.currencies(), api.settings.get()]);
    setCountries(c); setCurrencies(cur); setSettings(s);
  }, []);

  // On boot: if a token is already stored, validate it and load app data; otherwise show login.
  useEffect(() => {
    (async () => {
      try {
        const me = await api.auth.me();
        setUser(me.user);
        await refresh();
      } catch { /* not logged in, or token expired — Login page will handle it */ }
      finally { setAuthChecked(true); setLoading(false); }
    })();
  }, [refresh]);

  const login = async (username, password) => {
    const { token, user: u } = await api.auth.login(username, password);
    setToken(token);
    setUser(u);
    setLoading(true);
    await refresh();
    setLoading(false);
  };

  const notify = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 2800); };

  const updateSettings = async (patch) => {
    const s = await api.settings.update(patch);
    setSettings(s);
    notify('Settings saved');
    return s;
  };

  /** True if the current user's role is in the allowed list — use to gate UI actions. */
  const can = (...roles) => !!user && roles.includes(user.role);

  const activeCountry = countries.find((c) => c.code === country) ?? countries[0];

  return (
    <Ctx.Provider value={{ countries, currencies, settings, country, setCountry, activeCountry, loading, authChecked, user, login, logout, can, refresh, notify, updateSettings }}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
