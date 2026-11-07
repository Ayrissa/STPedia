import { S, DEFAULTS, t, esc, bus, getPath, setPath, saveSettings, getProfiles, loadModels, callLLM, clearCache, removeFav } from './core.js';
import { showSample, showEntry, closeCard } from './ui.js';

let host;
const err = e => toastr.error(t('errLoad') + (e && e.message ? e.message : e));

function favsHtml() {
    const list = S().favorites;
    if (!list.length) return `<small class="stp-note">${t('favEmpty')}</small>`;
    return list.map(f => {
        const sub = f.source === 'ai' ? 'AI' : `Wikipedia${f.lang ? ' · ' + f.lang : ''}`;
        const name = f.source === 'wiki' && f.url
            ? `<a class="stp-fav-t" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" title="${esc(t('favOpenWiki'))}">${esc(f.title)}</a>`
            : `<a class="stp-fav-t" href="#" data-act="favCard" data-key="${esc(f.key)}" title="${esc(t('favCard'))}">${esc(f.title)}</a>`;
        return `<div class="stp-fav"><i class="fa-solid fa-star stp-fav-star"></i>${name}<span class="stp-fav-sub">${sub}</span><span class="stp-fav-btns"><i class="fa-regular fa-window-maximize stp-fav-b" data-act="favCard" data-key="${esc(f.key)}" title="${esc(t('favCard'))}"></i><i class="fa-solid fa-xmark stp-fav-b" data-act="favDel" data-key="${esc(f.key)}" title="${esc(t('favRemove'))}"></i></span></div>`;
    }).join('');
}

function bodyHtml() {
    const s = S(), g = k => getPath(s, k);
    const row = (label, inner) => `<label class="stp-row"><span>${label}</span>${inner}</label>`;
    const sel = (k, opts, rr = false) => `<select class="text_pole stp-in" data-k="${k}"${rr ? ' data-rr="1"' : ''}>${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(g(k)) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const chk = (k, label, rr = false) => `<label class="checkbox_label"><input type="checkbox" class="stp-in" data-k="${k}"${rr ? ' data-rr="1"' : ''}${g(k) ? ' checked' : ''}><span>${label}</span></label>`;
    const inp = (k, type = 'text', extra = '') => `<input class="text_pole stp-in" type="${type}" data-k="${k}" value="${esc(g(k))}" ${extra}>`;
    const range = (k, label, a, b, unit = '%') => row(label, `<span class="stp-range"><input type="range" class="stp-in" data-k="${k}" min="${a}" max="${b}" value="${g(k)}"><span class="stp-val">${g(k)}${unit}</span></span>`);
    const profiles = getProfiles(), c = s.conn;
    const langs = [['ru', 'Русский'], ['en', 'English'], ['uk', 'Українська'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'], ['pl', 'Polski'], ['ja', '日本語'], ['zh', '中文']];
    const conn = c.mode === 'profile'
        ? (profiles.length ? row(t('profile'), sel('conn.profileId', [['', '—'], ...profiles.map(p => [p.id, esc(p.name)])])) : `<small class="stp-note">${t('noProfiles')}</small>`)
        : `${row(t('apiUrl'), inp('conn.url', 'text', 'placeholder="https://api.openai.com/v1" autocomplete="off"'))}${row(t('apiKey'), inp('conn.key', 'password', 'autocomplete="new-password"'))}${row(t('model'), inp('conn.model', 'text', 'list="stp_models" autocomplete="off"'))}<datalist id="stp_models"></datalist><div class="stp-btns"><div class="menu_button" data-act="models">${t('loadModels')}</div></div>`;

    return `
<div class="stp-sec">${chk('enabled', t('enabled'), true)}${row(t('language'), sel('lang', [['ru', 'Русский'], ['en', 'English']], true))}</div>
<div class="stp-sec"><h4>${t('secSource')}</h4>${row(t('mode'), sel('mode', [['auto', t('modeAuto')], ['wiki', t('modeWiki')], ['ai', t('modeAi')]]))}</div>
<div class="stp-sec"><h4>${t('secWiki')}</h4>
${row(t('wikiLang'), sel('wiki.lang', langs))}${chk('wiki.fallbackEn', t('fallbackEn'))}${chk('wiki.image', t('wikiImage'))}${chk('wiki.infobox', t('wikiInfobox'))}
${row(t('sentences'), inp('wiki.sentences', 'number', 'min="1" max="10"'))}${chk('wiki.hideParens', t('hideParens'))}
${row(t('names'), sel('wiki.names', [['smart', t('nmSmart')], ['always', t('nmAlways')], ['off', t('nmOff')]]))}</div>
<div class="stp-sec"><h4>${t('secAi')}</h4>
${row(t('connMode'), sel('conn.mode', [['profile', t('connProfile')], ['custom', t('connCustom')]], true))}${conn}
${row(t('temperature'), inp('conn.temperature', 'number', 'min="0" max="2" step="0.1"'))}${row(t('maxTokens'), inp('maxTokens', 'number', 'min="200" max="6000" step="100"'))}
<div class="stp-btns"><div class="menu_button" data-act="test">${t('test')}</div></div><small class="stp-note">${t('connNote')}</small>
${row(t('articleLang'), sel('ai.articleLang', [['chat', t('alChat')], ['ru', t('alRu')], ['en', t('alEn')]]))}
${row(t('length'), sel('ai.length', [['short', t('lenShort')], ['medium', t('lenMedium')], ['long', t('lenLong')]]))}
${chk('ai.context.card', t('ctxCard'))}${chk('ai.context.persona', t('ctxPersona'))}${chk('ai.context.lorebook', t('ctxLore'))}${chk('ai.context.authorNote', t('ctxNote'))}
${row(t('ctxMsgs'), inp('ai.context.chatMessages', 'number', 'min="0" max="30"'))}
${chk('ai.cache', t('cache'))}<div class="stp-btns"><div class="menu_button" data-act="clearCache">${t('clearCache')}</div></div></div>
<div class="stp-sec"><h4 id="stp_favs_h">${t('favorites')} (${s.favorites.length})</h4><div id="stp_favs">${favsHtml()}</div></div>
<div class="stp-sec"><h4>${t('secLook')}</h4>
${row(t('theme'), sel('ui.theme', [['wiki', t('thWiki')], ['dark', t('thDark')], ['sepia', t('thSepia')], ['st', t('thSt')]]))}
${range('ui.fontSize', t('fontSize'), 80, 140)}${range('ui.width', t('width'), 300, 560, 'px')}
${row(t('btnPos'), sel('ui.btnPos', [['auto', t('bpAuto')], ['above', t('bpAbove')], ['below', t('bpBelow')], ['end', t('bpEnd')], ['screen', t('bpScreen')]]))}
${row(t('maxWords'), inp('ui.maxWords', 'number', 'min="1" max="20"'))}
<div class="stp-btns"><div class="menu_button" data-act="sample">${t('sample')}</div></div></div>`;
}

function rebuild() {
    const title = document.getElementById('stp_title'), body = document.getElementById('stp_body');
    if (title) title.textContent = t('appName');
    if (body) body.innerHTML = bodyHtml();
}

export function initSettings() {
    host = document.getElementById('extensions_settings2');
    if (!host || document.getElementById('stp_drawer')) return;
    host.insertAdjacentHTML('beforeend', `<div id="stp_drawer" class="stp-settings"><div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b id="stp_title">${t('appName')}</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><div id="stp_body"></div></div></div></div>`);
    rebuild();

    const onInput = e => {
        const el = e.target;
        if (!el.classList || !el.classList.contains('stp-in')) return;
        const k = el.dataset.k;
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'number' || el.type === 'range') { v = Number(el.value); if (!Number.isFinite(v)) return; }
        else v = el.value;
        if (getPath(S(), k) === v) return;
        setPath(S(), k, v); saveSettings();
        if (el.type === 'range') { const out = el.parentElement.querySelector('.stp-val'); if (out) out.textContent = v + (k === 'ui.width' ? 'px' : '%'); }
        if (k === 'enabled') { bus.dispatchEvent(new Event('enabled')); if (!v) closeCard(); }
        if (k === 'lang') bus.dispatchEvent(new Event('lang'));
        if (el.dataset.rr) rebuild();
    };
    host.addEventListener('input', onInput);
    host.addEventListener('change', onInput);

    host.addEventListener('click', async e => {
        const a = e.target.closest('[data-act]');
        if (!a || !host.contains(a)) return;
        switch (a.dataset.act) {
            case 'sample': showSample(); break;
            case 'favCard': { e.preventDefault(); const f = S().favorites.find(x => x.key === a.dataset.key); if (f) showEntry(f); break; }
            case 'favDel': removeFav(a.dataset.key); break;
            case 'clearCache': await clearCache(); toastr.success(t('cleared')); break;
            case 'models': try { const m = await loadModels(); document.getElementById('stp_models').innerHTML = m.map(x => `<option value="${esc(x)}"></option>`).join(''); toastr.success(t('modelsLoaded') + m.length); } catch (er) { err(er); } break;
            case 'test': try { await callLLM([{ role: 'user', content: 'Reply with: OK' }], 200); toastr.success(t('okTest')); } catch (er) { err(er); } break;
        }
    });
    bus.addEventListener('lang', rebuild);
    bus.addEventListener('favorites', () => {
        const box = document.getElementById('stp_favs'), h = document.getElementById('stp_favs_h');
        if (box) box.innerHTML = favsHtml();
        if (h) h.textContent = `${t('favorites')} (${S().favorites.length})`;
    });
}
