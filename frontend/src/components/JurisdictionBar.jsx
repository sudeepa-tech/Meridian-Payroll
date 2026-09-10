import React from 'react';
import { useApp } from '../lib/AppContext.jsx';

const REGION_ORDER = ['North America', 'Middle East'];

export default function JurisdictionBar() {
  const { countries, activeCountry, country, setCountry, settings, updateSettings, currencies } = useApp();
  if (!activeCountry) return null;

  const byRegion = REGION_ORDER.map((r) => ({ region: r, list: countries.filter((c) => c.region === r) }));

  return (
    <div className="jbar">
      <div className="field" style={{ minWidth: 220 }}>
        <label htmlFor="country-select">Operating country</label>
        <select id="country-select" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
          {byRegion.map((g) => (
            <optgroup key={g.region} label={g.region}>
              {g.list.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="field" style={{ width: 190 }}>
        <label htmlFor="reporting-currency">Reporting currency</label>
        <select
          id="reporting-currency"
          className="input"
          value={settings?.reportingCurrency ?? 'USD'}
          onChange={(e) => updateSettings({ reportingCurrency: e.target.value })}
        >
          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
      </div>

      <div className="facts">
        <div className="fact">
          <small>Local currency</small>
          <b>{activeCountry.currency.code}</b>
        </div>
        <div className="fact">
          <small>Pay cycle</small>
          <b style={{ textTransform: 'capitalize' }}>{activeCountry.payFrequency}</b>
        </div>
        <div className="fact">
          <small>Region</small>
          <span className={`chip ${activeCountry.region === 'Middle East' ? 'gold' : 'blue'}`}>{activeCountry.region}</span>
        </div>
      </div>
    </div>
  );
}
