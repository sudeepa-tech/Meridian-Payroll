import { getCountry } from '../../core/index.js';

const COUNTRY_NAMES = { US: 'United States', AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman' };
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

export function statesFor(countryCode) {
  return countryCode === 'US' ? US_STATES : [];
}

/**
 * Ask Claude -- with the real Anthropic web_search server tool enabled -- to check for labor
 * law changes relevant to our configured rules for this country (and US state, if given)
 * since our knowledge of the statute was last set, and compare against our current
 * configuration. Requires ANTHROPIC_API_KEY; without it, returns a clear local fallback
 * rather than fabricating a "latest laws" result.
 */
export async function checkForUpdates(countryCode, state) {
  const key = process.env.ANTHROPIC_API_KEY;
  const country = getCountry(countryCode);
  const countryName = COUNTRY_NAMES[countryCode] ?? countryCode;
  const scopeLabel = state ? `${countryName} (${state})` : countryName;

  if (!key) {
    return {
      provider: 'local',
      summary: `AI-assisted law lookup requires ANTHROPIC_API_KEY to be set on the server (it uses live web search, not just training data). Without it, this can't respond -- the current configuration for ${scopeLabel} is shown as authored below, but hasn't been checked against any external source in this request.`,
      changes: [],
      sources: [],
    };
  }

  const currentConfig = {
    overtimeMultiplier: country.overtime.multiplier,
    overtimeThreshold: country.overtime.threshold,
    minimumWage: country.minimumWage,
    socialSecurity: country.socialSecurity?.name,
    endOfService: country.endOfService?.enabled ? `${country.endOfService.tiers.map((t) => t.daysPerYear).join('/')} days/yr` : 'N/A',
    leaveAnnual: country.leave?.annual?.accrualDaysPerYear,
    incomeTax: country.incomeTax?.enabled ? 'enabled' : 'none',
  };

  const prompt = `You are a payroll compliance analyst. Using web search, check for any recent (last 12 months) changes to labor law, minimum wage, overtime rules, social security contribution rates, or end-of-service/gratuity rules for ${scopeLabel} that would affect this system's current configuration:\n\n${JSON.stringify(currentConfig, null, 2)}\n\nRespond with ONLY valid JSON in this shape, no other text: { "summary": "1-2 sentence overview of what you found", "changes": [{ "area": "e.g. Minimum wage", "current": "what our system has configured", "finding": "what you found via search, with enough specificity to act on", "effectiveDate": "YYYY-MM-DD or null", "confidence": "high|medium|low", "actionNeeded": true|false }], "sources": [{ "title": "string", "url": "string" }] }. If you find no relevant changes, return an empty changes array and say so plainly in the summary. Never invent a source URL -- only include ones you actually retrieved via search.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { provider: 'error', summary: `Anthropic API returned an error (HTTP ${res.status}) while checking ${scopeLabel}. ${errBody.slice(0, 200)}`, changes: [], sources: [] };
    }
    const data = await res.json();
    const textBlocks = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const cleaned = textBlocks.trim().replace(/^```json\n?/, '').replace(/```$/, '');
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { summary: textBlocks.slice(0, 500) || 'No structured response returned.', changes: [], sources: [] };
    }
    const usedSearch = (data.content ?? []).some((c) => c.type === 'server_tool_use' || c.type === 'web_search_tool_result');
    return { provider: usedSearch ? 'anthropic-websearch' : 'anthropic', summary: parsed.summary ?? '', changes: parsed.changes ?? [], sources: parsed.sources ?? [] };
  } catch (e) {
    return { provider: 'error', summary: `Could not complete the check for ${scopeLabel}: ${e.message}`, changes: [], sources: [] };
  }
}
