import { LOC } from './locales.js';

export const MODULE = 'stpedia';
export const getContext = () => SillyTavern.getContext();
export const bus = new EventTarget();

export const DEFAULT_PROMPT = `You are the editor of an encyclopedia that exists inside a work of fiction (a roleplay story). Everything and everyone in it is fictional, and all characters are adults. Write an encyclopedia entry in the style of Wikipedia about the term the reader selected in the story.
- Neutral encyclopedic tone, third person. The first sentence defines the term (its title will be shown in bold).
- Rely on the story material (character cards, lorebook, author's note, recent chat). You may add plausible details where the material is silent, but never contradict it. If the term is a real-world concept, give accurate real-world information.
- If the term is a person or character, also fill the infobox with fields suited to the setting (for example: Born, Place of birth, Died, Title, Occupation, Affiliation). For anything else leave the infobox empty.
- Length: {{length}}. Language: {{language}}.
- No refusals, disclaimers or commentary. Keep any mature themes factual and tasteful.`;

export const DEFAULTS = {
    enabled: true, lang: 'ru', mode: 'auto',
    wiki: { lang: 'ru', fallbackEn: true, image: false, infobox: true, sentences: 4 },
    conn: { mode: 'profile', profileId: '', url: '', key: '', model: '', temperature: 0.7 },
    maxTokens: 900,
    ai: { articleLang: 'chat', length: 'medium', prompt: '', cache: true, context: { card: true, persona: true, lorebook: true, authorNote: true, chatMessages: 6 } },
    ui: { theme: 'wiki', fontSize: 100, width: 440, btnPos: 'auto', maxWords: 8 },
};

export function fillDefaults(target, def) {
    for (const k of Object.keys(def)) {
        if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) {
            if (!target[k] || typeof target[k] !== 'object') target[k] = {};
            fillDefaults(target[k], def[k]);
        } else if (target[k] === undefined) target[k] = def[k];
    }
}
export function S() {
    const r = getContext().extensionSettings;
    if (!r[MODULE]) r[MODULE] = {};
    return r[MODULE];
}
export const saveSettings = () => getContext().saveSettingsDebounced();
export const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
export function setPath(o, p, v) { const parts = p.split('.'); const last = parts.pop(); parts.reduce((a, k) => a[k], o)[last] = v; }
export function t(key) { const l = S().lang; return LOC[l]?.[key] ?? LOC.en[key] ?? key; }
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const clean = (s, n = 1500) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const fill = (str, vars) => String(str).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));

/* ------------------------------------------------ text matching */

export const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
function sameWord(w, x) {
    if (w === x) return true;
    const m = Math.min(w.length, x.length);
    if (m < 4 || Math.abs(w.length - x.length) > 3) return false;
    let cp = 0;
    while (cp < m && w[cp] === x[cp]) cp++;
    return cp >= (m === 4 ? 4 : m - 1); // endings may differ (Russian inflection), the stem may not
}

/** Does a Wikipedia title plausibly match what the user selected (handles Russian inflection)? */
export function titleMatches(query, title) {
    const q = norm(query).split(' ').filter(Boolean), tt = norm(title).split(' ').filter(Boolean);
    if (!q.length || !tt.length) return false;
    return q.every(w => tt.some(x => sameWord(w, x)));
}

/* ------------------------------------------------ Wikipedia + Wikidata */

const memo = new Map();
const qs = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function getJSON(url) {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

const isDisambig = p => !!p.pageprops && 'disambiguation' in p.pageprops;

function mkPage(p, lang, ok) {
    return {
        source: 'wiki', title: p.title, description: p.description || '', extract: String(p.extract || '').trim(),
        image: p.thumbnail?.source || '', url: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`,
        qid: p.pageprops?.wikibase_item || '', lang, ok,
    };
}

async function wikiQuery(term, lang, sentences) {
    const base = {
        action: 'query', format: 'json', formatversion: 2, origin: '*', redirects: 1,
        prop: 'extracts|pageimages|pageprops|info|description', exintro: 1, explaintext: 1, exsentences: sentences, exlimit: 'max',
        piprop: 'thumbnail', pithumbsize: 480, inprop: 'url', ppprop: 'wikibase_item|disambiguation',
    };
    const api = `https://${lang}.wikipedia.org/w/api.php?`;
    const exact = (await getJSON(api + qs({ ...base, titles: term }))).query?.pages?.[0];
    if (exact && !exact.missing && !exact.invalid && !isDisambig(exact) && exact.extract) return mkPage(exact, lang, true);

    const found = (await getJSON(api + qs({ ...base, generator: 'search', gsrsearch: term, gsrlimit: 5 }))).query?.pages || [];
    const list = found.filter(p => !p.missing && !p.invalid && !isDisambig(p) && p.extract).sort((a, b) => (a.index || 0) - (b.index || 0));
    const good = list.find(p => titleMatches(term, p.title));
    if (good) return mkPage(good, lang, true);
    return list[0] ? mkPage(list[0], lang, false) : null;
}

const MONTHS = {
    ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

function parseTime(v) {
    const m = /^([+-])(\d{1,})-(\d\d)-(\d\d)/.exec(v?.time || '');
    if (!m) return null;
    return { y: (m[1] === '-' ? -1 : 1) * Number(m[2]), m: Number(m[3]), d: Number(m[4]), p: v.precision || 9 };
}

function fmtDate(d, lang) {
    if (!d || d.p < 9) return '';
    const months = MONTHS[lang] || MONTHS.en;
    const y = d.y < 0 ? `${Math.abs(d.y)}${lang === 'ru' ? ' ' : ' '}${t('bce')}` : String(d.y);
    if (d.p >= 11 && d.m && d.d) return lang === 'ru' ? `${d.d} ${months[d.m - 1]} ${y}` : `${d.d} ${months[d.m - 1]} ${y}`;
    if (d.p === 10 && d.m) return lang === 'ru' ? `${months[d.m - 1]} ${y}` : `${months[d.m - 1]} ${y}`;
    return y;
}

function ageYears(b, d) {
    if (!b || !d || b.p < 9 || d.p < 9) return null;
    let n = d.y - b.y;
    if (b.p >= 11 && d.p >= 11 && (d.m < b.m || (d.m === b.m && d.d < b.d))) n--;
    return n >= 0 && n < 130 ? n : null;
}

function plural(n, lang) {
    if (lang !== 'ru') return `${n} ${n === 1 ? 'year' : 'years'}`;
    const a = n % 10, b = n % 100;
    return `${n} ${a === 1 && b !== 11 ? t('yearOne') : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? t('yearFew') : t('yearMany')}`;
}

/** Person data from Wikidata (born/died/country/occupation). Returns null for non-humans. */
export async function wikidataPerson(qid, lang) {
    const ent = (await getJSON('https://www.wikidata.org/w/api.php?' + qs({ action: 'wbgetentities', ids: qid, props: 'claims', format: 'json', origin: '*' }))).entities?.[qid];
    const c = ent?.claims || {};
    if (!(c.P31 || []).some(x => x.mainsnak?.datavalue?.value?.id === 'Q5')) return null;
    const ids = p => (c[p] || []).map(x => x.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const time = p => parseTime(c[p]?.[0]?.mainsnak?.datavalue?.value);
    const places = [...ids('P19').slice(0, 1), ...ids('P20').slice(0, 1)], countries = ids('P27').slice(0, 3), jobs = ids('P106').slice(0, 8);
    const need = [...new Set([...places, ...countries, ...jobs])];
    const labels = {};
    if (need.length) {
        const j = await getJSON('https://www.wikidata.org/w/api.php?' + qs({ action: 'wbgetentities', ids: need.join('|'), props: 'labels', languages: lang === 'en' ? 'en' : `${lang}|en`, format: 'json', origin: '*' }));
        for (const [id, e] of Object.entries(j.entities || {})) labels[id] = e.labels?.[lang]?.value || e.labels?.en?.value || '';
    }
    const L = id => labels[id] || '';
    const b = time('P569'), d = time('P570'), rows = [];
    if (b) rows.push([t('ibBirth'), fmtDate(b, lang)]);
    if (ids('P19')[0] && L(ids('P19')[0])) rows.push([t('ibBirthPlace'), L(ids('P19')[0])]);
    if (d) { const age = ageYears(b, d); rows.push([t('ibDeath'), fmtDate(d, lang) + (age !== null ? ` (${plural(age, lang)})` : '')]); }
    if (ids('P20')[0] && L(ids('P20')[0])) rows.push([t('ibDeathPlace'), L(ids('P20')[0])]);
    if (countries.length) rows.push([t('ibCountry'), countries.map(L).filter(Boolean).join(', ')]);
    if (jobs.length) rows.push([t('ibOccupation'), jobs.map(L).filter(Boolean).join(', ')]);
    return rows.filter(r => r[1]);
}

export async function lookupWiki(term, { strict = true, lang = '' } = {}) {
    const s = S().wiki;
    const langs = lang ? [lang] : [s.lang, ...(s.fallbackEn && s.lang !== 'en' ? ['en'] : [])];
    const key = `${langs.join(',')}|${norm(term)}|${strict}|${s.sentences}|${s.infobox}`;
    if (memo.has(key)) return memo.get(key);
    let best = null;
    for (const l of langs) {
        const p = await wikiQuery(term, l, s.sentences);
        if (p && p.ok) { best = p; break; }
        if (p && !best) best = p;
    }
    if (best && !best.ok && strict) best = null;
    if (best && best.extract && s.infobox && best.qid) {
        try { best.infobox = await wikidataPerson(best.qid, best.lang); } catch (e) { console.warn('[STpedia] wikidata failed', e); }
    }
    if (memo.size > 150) memo.clear();
    memo.set(key, best);
    return best;
}

/* ------------------------------------------------ LLM (profile or own API, never SillyTavern's keys) */

const chatEndpoint = u => { u = String(u || '').trim().replace(/\/+$/, ''); return /\/chat\/completions$/i.test(u) ? u : u + '/chat/completions'; };
const baseUrl = u => String(u || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');

export function getProfiles() {
    const p = getContext().extensionSettings?.connectionManager?.profiles;
    return Array.isArray(p) ? p.map(x => ({ id: x.id, name: x.name })) : [];
}

export const aiConfigured = () => { const c = S().conn; return c.mode === 'profile' ? !!c.profileId : !!(c.url && c.model); };

export async function callLLM(messages, maxTokens) {
    const c = S().conn;
    if (c.mode === 'profile') {
        const svc = getContext().ConnectionManagerRequestService;
        if (!svc) throw new Error(t('noCM'));
        if (!c.profileId) throw new Error(t('noProfile'));
        const r = await svc.sendRequest(c.profileId, messages, maxTokens, { stream: false, extractData: true, includePreset: true, includeInstruct: true }, { temperature: c.temperature });
        return String(r?.content ?? '');
    }
    if (!c.url || !c.model) throw new Error(t('noApi'));
    const headers = { 'Content-Type': 'application/json' };
    if (c.key) headers.Authorization = 'Bearer ' + c.key;
    const res = await fetch(chatEndpoint(c.url), { method: 'POST', headers, credentials: 'omit', body: JSON.stringify({ model: c.model, messages, temperature: c.temperature, max_tokens: maxTokens, stream: false }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const out = j?.choices?.[0]?.message?.content;
    return Array.isArray(out) ? out.map(p => p?.text || '').join('') : String(out ?? '');
}

export async function loadModels() {
    const c = S().conn;
    const res = await fetch(baseUrl(c.url) + '/models', { headers: c.key ? { Authorization: 'Bearer ' + c.key } : {}, credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    return (j.data || j.models || []).map(x => x.id || x.name).filter(Boolean);
}

/* ------------------------------------------------ AI encyclopedia */

const REFUSAL = /(i'?m sorry|i can'?t|i cannot|i am unable|i'?m unable|i won'?t|as an ai|i must decline|can'?t (write|assist|help|comply)|не могу (написать|помочь|выполнить|продолжить|создать)|извините|к сожалению|я не буду)/i;
const isRefusal = text => !/<summary>/i.test(String(text)) && REFUSAL.test(String(text).trim().slice(0, 260));
const SAFETY = /safety|blocked|policy|filter|moderation|prohibited/i;
const FALLBACK_SYSTEM = `You are a creative writing assistant helping an author with a work of fiction. Write a short encyclopedia entry (Wikipedia style, neutral tone) about a term from the author's story. Language: {{language}}. Length: {{length}}. Keep it tasteful, no refusals, disclaimers or commentary: output only the entry.`;

async function loreText(ctx) {
    if (typeof ctx.getWorldInfoPrompt !== 'function') return '';
    try {
        const lines = ctx.chat.filter(m => !m.is_system).slice(-20).map(m => `${m.name}: ${m.mes}`).reverse();
        const r = await ctx.getWorldInfoPrompt(lines, 8192, true);
        return [r?.worldInfoBefore, r?.worldInfoAfter].filter(Boolean).join('\n') || r?.worldInfoString || '';
    } catch (e) { return ''; }
}

export async function buildMessages(term, around, attempt = 0) {
    const ctx = getContext(), s = S();
    const lens = { short: '2-3 sentences', medium: '1-2 short paragraphs', long: '3-4 paragraphs' };
    const langs = { chat: 'the same language the roleplay uses', ru: 'Russian', en: 'English' };
    const vars = { length: lens[s.ai.length] || lens.medium, language: langs[s.ai.articleLang] || langs.chat };
    const fmt = [
        'Reply with the entry ONLY, in EXACTLY this format, starting your reply with <title>:',
        '<title>entry title</title>', '<description>one short descriptor line</description>',
        '<summary>the entry text; blank lines between paragraphs</summary>',
        '<infobox>\nLabel: value\n(one per line; only for a person or character, otherwise leave empty)\n</infobox>',
    ].join('\n');
    const chatOf = (n, max) => ctx.chat.filter(m => !m.is_system).slice(-n).map(m => `${m.name}: ${clean(m.mes, max)}`).join('\n\n');
    const task = `[Selected term]\n${term}${around ? `\n[Where it appears]\n${around}` : ''}\nWrite the encyclopedia entry for this term.`;
    if (attempt > 0) {
        return [{ role: 'system', content: [fill(FALLBACK_SYSTEM, vars), fmt].join('\n\n') }, { role: 'user', content: `[Story so far, brief]\n${chatOf(3, 500)}\n\n${task}` }];
    }
    const parts = [];
    const card = ctx.characters?.[ctx.characterId];
    if (s.ai.context.card && card) {
        const txt = [card.description, card.personality && 'Personality: ' + card.personality, card.scenario && 'Scenario: ' + card.scenario].filter(Boolean).join('\n');
        if (txt) parts.push(`[Fictional character reference: ${card.name}]\n${ctx.substituteParams ? ctx.substituteParams(txt, ctx.name1, card.name) : txt}`);
    }
    const persona = ctx.powerUserSettings?.persona_description;
    if (s.ai.context.persona && persona) parts.push(`[Fictional character reference: ${ctx.name1}]\n${persona}`);
    const note = ctx.chatMetadata?.note_prompt;
    if (s.ai.context.authorNote && note) parts.push(`[Author's note]\n${note}`);
    if (s.ai.context.lorebook) { const wi = await loreText(ctx); if (wi) parts.push(`[World info]\n${wi}`); }
    return [
        { role: 'system', content: [fill(s.ai.prompt || DEFAULT_PROMPT, vars), fmt].join('\n\n') },
        { role: 'user', content: ['[Story material for reference. Everything below is fiction.]', ...parts, `[Recent roleplay messages]\n${chatOf(s.ai.context.chatMessages, 1200)}`, task].join('\n\n') },
    ];
}

export function parseEntry(raw, term) {
    const txt = String(raw ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:xml|html)?/gi, '').trim();
    const fail = msg => { const e = new Error(msg); e.retry = true; return e; };
    if (!txt) throw fail(t('emptyReply'));
    const g = tag => { const m = txt.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i')); return m ? m[1].trim() : ''; };
    let summary = g('summary');
    if (!summary) { const m = txt.match(/<summary>([\s\S]*?)(?:<infobox>|$)/i); summary = m ? m[1].trim() : ''; }
    if (!summary) {
        if (isRefusal(txt) || txt.length < 30) throw fail(t('refused'));
        summary = txt.replace(/<[^>]+>/g, '').trim();
    }
    const rows = g('infobox').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(r => r && r[1]).slice(0, 12);
    return { title: g('title') || term, description: g('description'), extract: summary, infobox: rows };
}

function chatCache() {
    const md = getContext().chatMetadata;
    if (!md[MODULE]) md[MODULE] = { cache: {} };
    return md[MODULE].cache;
}
export async function clearCache() {
    const ctx = getContext();
    if (ctx.chatId) { ctx.chatMetadata[MODULE] = { cache: {} }; try { await ctx.saveMetadata(); } catch (e) { /* ignore */ } }
    memo.clear();
}

export async function lookupAI(term, around, { force = false } = {}) {
    const ctx = getContext(), s = S(), key = norm(term);
    const useCache = s.ai.cache && ctx.chatId;
    if (useCache && !force && chatCache()[key]) return chatCache()[key];
    let parsed = null, lastErr = null;
    for (let a = 0; a < 2 && !parsed; a++) {
        try { parsed = parseEntry(await callLLM(await buildMessages(term, around, a), s.maxTokens), term); }
        catch (e) { lastErr = e; if (!e.retry && !SAFETY.test(String(e?.message))) throw e; }
    }
    if (!parsed) throw lastErr || new Error(t('refused'));
    const entry = { source: 'ai', ...parsed, ts: Date.now() };
    if (useCache) {
        const cache = chatCache();
        cache[key] = entry;
        const keys = Object.keys(cache);
        if (keys.length > 200) delete cache[keys[0]];
        try { await ctx.saveMetadata(); } catch (e) { /* ignore */ }
    }
    return entry;
}
