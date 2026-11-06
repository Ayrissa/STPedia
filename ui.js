import { S, t, esc, lookupWiki, lookupAI, aiConfigured } from './core.js';

let btn, card, current = null, history = [], token = 0, pending = null, pressing = false, selTimer = 0;
const ic = n => `<i class="fa-solid fa-${n}"></i>`;
const isCoarse = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const q = sel => card.querySelector(sel);

/* ------------------------------------------------ selection -> "?" button */

function cleanTerm(raw) {
    return String(raw).replace(/\s+/g, ' ').trim()
        .replace(/^[\s"'«»“”„‘’(\[{—–-]+/, '').replace(/[\s"'«»“”„‘’)\]}.,;:!?…—–-]+$/, '');
}

function readSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0), node = range.commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.closest) return null;
    const block = el.closest('#chat .mes_text') || el.closest('.stp-card .stp-body');
    if (!block) return null;
    const term = cleanTerm(sel.toString());
    if (term.length < 2 || term.length > 120 || !/\p{L}/u.test(term) || term.split(' ').length > S().ui.maxWords) return null;
    const full = block.textContent || '', i = full.indexOf(term.split(' ')[0]);
    const around = i >= 0 ? full.slice(Math.max(0, i - 220), i + term.length + 220).replace(/\s+/g, ' ').trim() : '';
    return { term, range, around };
}

function placeButton(range) {
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) return false;
    const first = rects[0], last = rects[rects.length - 1], size = 36, gap = 8;
    let pos = S().ui.btnPos;
    if (pos === 'auto') pos = isCoarse() ? 'end' : 'above';
    let x = 0, y = 0;
    if (pos === 'above') { x = first.left + first.width / 2 - size / 2; y = first.top - size - gap; if (y < 8) pos = 'below'; }
    if (pos === 'below') { x = last.left + last.width / 2 - size / 2; y = last.bottom + gap; }
    if (pos === 'end') {
        x = last.right + gap; y = last.top + last.height / 2 - size / 2;
        if (x > innerWidth - size - 8) { x = last.right - size; y = last.top - size - gap; if (y < 8) y = last.bottom + gap; }
    }
    btn.style.left = Math.max(8, Math.min(innerWidth - size - 8, x)) + 'px';
    btn.style.top = Math.max(8, Math.min(innerHeight - size - 8, y)) + 'px';
    return true;
}

const hideBtn = () => btn && btn.classList.remove('on');

function onSelectionChange() {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
        if (!S().enabled) return hideBtn();
        const r = readSelection();
        if (!r) { if (!pressing) hideBtn(); return; }
        const rc = r.range.getBoundingClientRect();
        pending = { term: r.term, around: r.around, anchor: { left: rc.left, right: rc.right, top: rc.top, bottom: rc.bottom } };
        if (placeButton(r.range)) btn.classList.add('on');
    }, isCoarse() ? 350 : 150);
}

/* ------------------------------------------------ card */

function position(anchor) {
    const w = Math.min(S().ui.width, innerWidth - 16);
    card.style.setProperty('--stp-w', w + 'px');
    const sheet = innerWidth <= 600;
    card.classList.toggle('stp-sheet', sheet);
    card.classList.toggle('stp-center', !sheet && !anchor);
    if (sheet || !anchor) { card.style.left = ''; card.style.top = ''; return; }
    const h = Math.min(w * 0.75, innerHeight * 0.7);
    const left = Math.max(8, Math.min(innerWidth - w - 8, anchor.left));
    let top = anchor.bottom + 10;
    if (top + h > innerHeight - 8) top = anchor.top - h - 10;
    if (top < 8) top = Math.max(8, Math.min(innerHeight - h - 8, anchor.bottom + 10));
    card.style.left = left + 'px'; card.style.top = top + 'px';
}

function boldTitle(text, title) {
    const base = String(title || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const i = base ? text.toLowerCase().indexOf(base.toLowerCase()) : -1;
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<b>' + esc(text.slice(i, i + base.length)) + '</b>' + esc(text.slice(i + base.length));
}

function entryHtml(e) {
    const wiki = e.source === 'wiki';
    const paras = String(e.extract || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map((p, i) => `<p>${i === 0 ? boldTitle(p, e.title) : esc(p)}</p>`).join('');
    const photo = wiki && S().wiki.image && e.image ? `<figure class="stp-fig"><img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"><figcaption>${esc(e.title)}</figcaption></figure>` : '';
    const ib = e.infobox && e.infobox.length ? `<table class="stp-ib">${e.infobox.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>` : '';
    const foot = wiki
        ? `${e.ok === false ? `<div class="stp-loose">${t('loose')}</div>` : ''}<a class="stp-more" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${t('readMore')} →</a>`
        : `<div class="stp-ainote">${t('aiNote')}</div>`;
    return `<div class="stp-sub">${wiki ? t('subWiki') : t('subAi')}</div>${e.description ? `<div class="stp-desc">${esc(e.description)}</div>` : ''}${photo}${paras}${ib}${foot}`;
}

function render() {
    const st = current;
    if (!st || !card) return;
    const ui = S().ui, mode = S().mode;
    card.dataset.theme = ui.theme;
    card.style.setProperty('--stp-fs', String(ui.fontSize / 100));
    const data = st.data[st.src], status = st.status[st.src];
    q('.stp-title').textContent = (data && data.title) || st.term;

    const tools = `${st.src === 'wiki' && mode !== 'ai' ? `<button class="stp-ico" data-act="lang" title="${esc(t('langToggle'))}">${ic('language')}</button>` : ''}<button class="stp-ico" data-act="refresh" title="${esc(t('refresh'))}">${ic('rotate')}</button>`;
    const tab = (src, label) => `<button class="stp-tab${st.src === src ? ' on' : ''}${st.status[src] === 'notfound' ? ' dim' : ''}" data-act="tab" data-src="${src}">${label}</button>`;
    const tabs = mode === 'auto' ? tab('wiki', t('tabWiki')) + tab('ai', t('tabAi')) : `<span class="stp-tab on">${mode === 'ai' ? t('tabAi') : t('tabWiki')}</span>`;
    q('.stp-tabs').innerHTML = `${tabs}<span class="stp-tools">${tools}</span>`;
    q('[data-act=back]').hidden = !history.length;

    let html;
    if (status === 'loading' || !status) html = `<div class="stp-sub">${st.src === 'ai' ? t('writing') : t('loading')}</div><div class="stp-sk"></div><div class="stp-sk"></div><div class="stp-sk short"></div>`;
    else if (status === 'error') html = `<p class="stp-err">${esc(t('errLoad') + (st.err[st.src] || ''))}</p><button class="stp-btn" data-act="retry">${t('retry')}</button>`;
    else if (status === 'notfound') html = `<p>${t('notFound')}</p>${!aiConfigured() && mode !== 'wiki' ? `<p class="stp-sub">${t('notFoundHint')}</p>` : ''}`;
    else html = entryHtml(data);
    q('.stp-body').innerHTML = html;
}

async function load(src, my, opts = {}) {
    const st = current;
    st.src = src; st.status[src] = 'loading'; render();
    try {
        const data = src === 'wiki'
            ? await lookupWiki(st.term, { strict: S().mode === 'auto' && !opts.loose, lang: st.forceLang })
            : await lookupAI(st.term, st.around, { force: opts.force });
        if (my !== token) return;
        st.data[src] = data; st.status[src] = data ? 'ok' : 'notfound';
    } catch (e) {
        if (my !== token) return;
        console.error('[STpedia]', e);
        st.status[src] = 'error'; st.err[src] = e && e.message ? e.message : String(e);
    }
    render();
}

export async function openTerm(term, around, anchor, { push = false } = {}) {
    if (push && current) history.push(current); else history = [];
    const my = ++token, mode = S().mode;
    current = { term, around, anchor, src: mode === 'ai' ? 'ai' : 'wiki', status: {}, data: {}, err: {}, forceLang: '' };
    card.hidden = false; card.classList.add('on');
    position(anchor); render();
    if (mode === 'ai') return load('ai', my);
    if (mode === 'wiki') return load('wiki', my, { loose: true });
    await load('wiki', my);
    if (my === token && current.status.wiki !== 'ok' && aiConfigured()) await load('ai', my);
}

export function showSample() {
    history = []; token++;
    const L = S().lang === 'ru';
    current = {
        term: t('sampleTitle'), around: '', anchor: null, src: 'wiki', status: { wiki: 'ok' }, err: {}, forceLang: '',
        data: { wiki: {
            source: 'wiki', title: t('sampleTitle'), description: L ? 'персонаж древнегреческой мифологии' : 'figure of Greek mythology', extract: t('sampleBody'), image: '', url: 'https://ru.wikipedia.org', ok: true,
            infobox: L ? [['Дата рождения', '14 марта 1879'], ['Место рождения', 'Ульм, Королевство Вюртемберг'], ['Дата смерти', '18 апреля 1955 (76 лет)'], ['Страна', 'Германия, Швейцария, США'], ['Род деятельности', 'физик-теоретик, философ науки']]
                : [['Born', '14 March 1879'], ['Birthplace', 'Ulm, Kingdom of Württemberg'], ['Died', '18 April 1955 (76 years)'], ['Country', 'Germany, Switzerland, USA'], ['Occupation', 'theoretical physicist, philosopher of science']],
        } },
    };
    card.hidden = false; card.classList.add('on'); position(null); render();
}

export function closeCard() {
    token++; history = []; current = null;
    if (card) { card.hidden = true; card.classList.remove('on'); }
}

function onAction(act, el) {
    const st = current;
    if (!st) return;
    switch (act) {
        case 'close': closeCard(); break;
        case 'back': if (history.length) { current = history.pop(); token++; render(); } break;
        case 'tab': {
            const src = el.dataset.src;
            if (st.status[src] === 'loading') { st.src = src; render(); break; }
            if (!st.status[src] || st.status[src] === 'error') load(src, token, { loose: true });
            else if (src === 'wiki' && st.status.wiki === 'notfound') load('wiki', token, { loose: true });
            else { st.src = src; render(); }
            break;
        }
        case 'retry': case 'refresh': load(st.src, token, { loose: true, force: act === 'refresh' }); break;
        case 'lang': { const w = S().wiki.lang; st.forceLang = (st.forceLang || w) === 'en' ? (w === 'en' ? 'ru' : w) : 'en'; load('wiki', token, { loose: true }); break; }
    }
}

export function initUi() {
    btn = document.createElement('button');
    btn.className = 'stp-q'; btn.type = 'button'; btn.textContent = '?'; btn.title = t('ask');
    document.body.appendChild(btn);

    card = document.createElement('div');
    card.className = 'stp-card'; card.hidden = true; card.setAttribute('role', 'dialog');
    card.innerHTML = `<div class="stp-top"><h2 class="stp-title"></h2><div class="stp-win"><button class="stp-ico" data-act="back" title="${esc(t('back'))}" hidden>${ic('arrow-left')}</button><button class="stp-ico" data-act="close" title="${esc(t('close'))}">${ic('xmark')}</button></div></div><div class="stp-tabs"></div><div class="stp-body"></div>`;
    document.body.appendChild(card);

    btn.addEventListener('mousedown', e => { e.preventDefault(); pressing = true; });
    btn.addEventListener('pointerdown', () => { pressing = true; });
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); pressing = false;
        if (!pending) return;
        const p = pending; hideBtn();
        try { window.getSelection().removeAllRanges(); } catch (err) { /* ignore */ }
        openTerm(p.term, p.around, p.anchor, { push: !card.hidden });
    });
    document.addEventListener('pointerup', () => setTimeout(() => { pressing = false; }, 400));

    card.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a) onAction(a.dataset.act, a); });
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerdown', e => {
        if (card.hidden || card.contains(e.target) || btn.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.stp-settings')) return;
        closeCard();
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
    window.addEventListener('resize', () => { if (!card.hidden) position(current && current.anchor); hideBtn(); });
    window.addEventListener('scroll', () => { hideBtn(); onSelectionChange(); }, true);
}
