import { S, t, esc, lookupWiki, lookupAI, aiConfigured, toggleFav, isFav, bus } from './core.js';

let btn, card, current = null, history = [], token = 0, pending = null, pressing = false, selTimer = 0;
const ic = n => `<i class="fa-solid fa-${n}"></i>`;
const hasPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
/** The top layer is above every z-index, so SillyTavern's own drawers and overlays can never cover or block the card. */
function topLayer(el, on) {
    if (!hasPopover || !el) return;
    try {
        const open = el.matches(':popover-open');
        if (on && !open) el.showPopover(); else if (!on && open) el.hidePopover();
    } catch (e) { /* ignore */ }
}
const reportError = e => { console.error('[STpedia]', e); try { toastr.error('STpedia: ' + (e && e.message ? e.message : e)); } catch (er) { /* ignore */ } };
const showCard = () => { card.hidden = false; card.classList.add('on'); topLayer(card, true); };
const hideCard = () => { topLayer(card, false); card.hidden = true; card.classList.remove('on'); };
const showBtn = () => { btn.classList.add('on'); topLayer(btn, true); };
const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);
/** A touch device (some phone browsers in "desktop site" mode do not report a coarse pointer). */
const isCoarse = () => mq('(pointer: coarse)') || (navigator.maxTouchPoints > 0 && !(mq('(any-pointer: fine)') && mq('(hover: hover)')));
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
    let midCap = false;
    try {
        const pre = document.createRange();
        pre.selectNodeContents(block); pre.setEnd(range.startContainer, range.startOffset);
        const before = pre.toString().trimEnd();
        midCap = /^\p{Lu}/u.test(term) && before.length > 0 && !/[.!?…:"«“„—–-]$/.test(before);
    } catch (e) { /* ignore */ }
    return { term, range, around, midCap };
}

function placeButton(range) {
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) return false;
    const first = rects[0], last = rects[rects.length - 1], size = 36, gap = 8;
    let pos = S().ui.btnPos;
    if (pos === 'auto') pos = isCoarse() ? 'screen' : 'above';
    setPill(pos === 'screen');
    if (pos === 'screen') return true;
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

const hideBtn = () => { if (btn) { btn.classList.remove('on'); topLayer(btn, false); } };

/** On touch screens the button is a pill at the bottom of the screen: away from the selection handles and the system toolbar. */
function setPill(on) {
    btn.classList.toggle('stp-pill', on);
    const label = btn.querySelector('.stp-ql');
    const text = on ? t('ask') : '';
    if (label && label.textContent !== text) label.textContent = text;   // never replace the nodes: a finger may be resting on them
    if (on) {
        const vv = window.visualViewport, vh = vv ? vv.height : innerHeight, oy = vv ? vv.offsetTop : 0;
        btn.style.left = ''; btn.style.top = Math.max(8, oy + vh - 48 - 100) + 'px';
    }
}

let fireLock = 0;
function fireButton() {
    if (Date.now() < fireLock || !pending) return;
    fireLock = Date.now() + 700;
    pressing = false;
    const p = pending; hideBtn();
    try { window.getSelection().removeAllRanges(); } catch (err) { /* ignore */ }
    openTerm(p.term, p.around, p.anchor, { push: !card.hidden, midCap: p.midCap }).catch(reportError);
}

function onSelectionChange() {
    clearTimeout(selTimer);
    selTimer = setTimeout(() => {
        if (pressing) return;                       // a finger is on the button: do not touch it
        if (!S().enabled) return hideBtn();
        const r = readSelection();
        if (!r) { if (!pressing) hideBtn(); return; }
        const rc = r.range.getBoundingClientRect();
        pending = { term: r.term, around: r.around, midCap: r.midCap, anchor: { left: rc.left, right: rc.right, top: rc.top, bottom: rc.bottom } };
        if (placeButton(r.range)) showBtn();
    }, isCoarse() ? 350 : 150);
}

/* ------------------------------------------------ card */

function position(anchor) {
    const vv = window.visualViewport;
    const vw = vv ? vv.width : innerWidth, vh = vv ? vv.height : innerHeight, ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0;
    const w = Math.max(220, Math.min(S().ui.width, vw - 16));
    const sheet = vw <= 600;
    const h = Math.round(sheet ? Math.min(w * 1.1, vh * 0.62) : Math.min(w * 0.75, vh * 0.7));
    card.style.setProperty('--stp-w', w + 'px');
    card.style.width = w + 'px'; card.style.height = h + 'px';
    let left, top;
    if (sheet) { left = ox + (vw - w) / 2; top = oy + vh - h - 12; }
    else if (!anchor) { left = ox + (vw - w) / 2; top = oy + (vh - h) / 2; }
    else {
        left = Math.max(8, Math.min(vw - w - 8, anchor.left));
        top = anchor.bottom + 10;
        if (top + h > vh - 8) top = anchor.top - h - 10;
        if (top < 8) top = Math.max(8, Math.min(vh - h - 8, anchor.bottom + 10));
    }
    card.style.left = Math.round(left) + 'px'; card.style.top = Math.round(Math.max(0, top)) + 'px';
}

function boldTitle(text, title) {
    const base = String(title || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const i = base ? text.toLowerCase().indexOf(base.toLowerCase()) : -1;
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<b>' + esc(text.slice(i, i + base.length)) + '</b>' + esc(text.slice(i + base.length));
}

/** AI models like to answer with markdown: turn it into real bold / italic (input is already escaped). */
function md(html) {
    return html
        .replace(/^\s*[*•-]\s+/gm, '• ')
        .replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>')
        .replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
        .replace(/__([^_]+?)__/g, '<b>$1</b>')
        .replace(/(^|[^*\w])\*([^\s*][^*]*?)\*(?!\*)/g, '$1<i>$2</i>')
        .replace(/(^|[^_\w])_([^\s_][^_]*?)_(?!\w)/g, '$1<i>$2</i>')
        .replace(/\*{1,3}/g, '');
}
const plainMd = s => String(s || '').replace(/[*_#]+/g, '').trim();

function entryHtml(e) {
    const wiki = e.source === 'wiki';
    const fmt = x => (wiki ? x : md(x));
    const paras = String(e.extract || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map((p, i) => {
        const html = (i === 0 && !(!wiki && /\*\*|__/.test(p)) && e.kind !== 'disambig') ? boldTitle(plainMd(p) === p ? p : (wiki ? p : plainMd(p)), e.title) : esc(p);
        return `<p>${fmt(html)}</p>`;
    }).join('');
    const photo = wiki && S().wiki.image && e.image ? `<figure class="stp-fig"><img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"><figcaption>${esc(e.title)}</figcaption></figure>` : '';
    const ib = e.infobox && e.infobox.length ? `<table class="stp-ib">${e.infobox.map(r => `<tr><th>${fmt(esc(r[0]))}</th><td>${fmt(esc(r[1]))}</td></tr>`).join('')}</table>` : '';
    const foot = wiki
        ? `${e.ok === false ? `<div class="stp-loose">${t('loose')}</div>` : ''}${e.kind === 'disambig' ? `<div class="stp-loose">${t('disambigNote')}</div>` : ''}<a class="stp-more" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${t('readMore')} →</a>`
        : `<div class="stp-ainote">${t('aiNote')}</div>`;
    return `<div class="stp-sub">${wiki ? t('subWiki') : t('subAi')}</div>${e.description ? `<div class="stp-desc">${fmt(esc(e.description))}</div>` : ''}${photo}${paras}${ib}${foot}`;
}

const setHtml = (el, html) => { if (el._h !== html) { el.innerHTML = html; el._h = html; } };

function render() {
    const st = current;
    if (!st || !card) return;
    const ui = S().ui, mode = S().mode;
    card.dataset.theme = ui.theme;
    card.style.setProperty('--stp-fs', String(ui.fontSize / 100));
    const data = st.data[st.src], status = st.status[st.src];
    q('.stp-title').textContent = plainMd((data && data.title) || st.term);
    const favBtn = q('[data-act=fav]'), fav = !!data && status === 'ok' && isFav(data);
    favBtn.hidden = !(data && status === 'ok');
    favBtn.classList.toggle('on', fav);
    favBtn.title = fav ? t('favRemove') : t('favSave');
    const favHtml = `<i class="fa-${fav ? 'solid' : 'regular'} fa-star"></i>`;
    if (favBtn._h !== favHtml) { favBtn.innerHTML = favHtml; favBtn._h = favHtml; }

    const tools = `${st.src === 'wiki' && mode !== 'ai' ? `<button class="stp-ico" data-act="lang" title="${esc(t('langToggle'))}">${ic('language')}</button>` : ''}<button class="stp-ico" data-act="refresh" title="${esc(t('refresh'))}">${ic('rotate')}</button>`;
    const tab = (src, label) => `<button class="stp-tab${st.src === src ? ' on' : ''}${st.status[src] === 'notfound' ? ' dim' : ''}" data-act="tab" data-src="${src}">${label}</button>`;
    const tabs = mode === 'auto' ? tab('wiki', t('tabWiki')) + tab('ai', t('tabAi')) : `<span class="stp-tab on">${mode === 'ai' ? t('tabAi') : t('tabWiki')}</span>`;
    setHtml(q('.stp-tabs'), `${tabs}<span class="stp-tools">${tools}</span>`);
    q('[data-act=back]').hidden = !history.length;

    let html;
    if (status === 'loading' || !status) html = `<div class="stp-sub">${st.src === 'ai' ? t('writing') : t('loading')}</div><div class="stp-sk"></div><div class="stp-sk"></div><div class="stp-sk short"></div>`;
    else if (status === 'error') html = `<p class="stp-err">${esc(t('errLoad') + (st.err[st.src] || ''))}</p><button class="stp-btn" data-act="retry">${t('retry')}</button>`;
    else if (status === 'notfound') html = `<p>${t('notFound')}</p>${!aiConfigured() && mode !== 'wiki' ? `<p class="stp-sub">${t('notFoundHint')}</p>` : ''}`;
    else html = entryHtml(data);
    setHtml(q('.stp-body'), html);
}

/** Should the article about the NAME be preferred (a capitalised single word in the middle of a sentence)? */
function wantsName(st) {
    const mode = S().wiki.names, single = !/\s/.test(st.term) && /^\p{Lu}/u.test(st.term) && st.term.length >= 3;
    return mode === 'always' ? single : mode === 'smart' ? single && !!st.midCap : false;
}

async function load(src, my, opts = {}) {
    const st = current;
    st.src = src; st.status[src] = 'loading'; render();
    try {
        const data = src === 'wiki'
            ? await lookupWiki(st.term, { strict: S().mode === 'auto' && !opts.loose, lang: st.forceLang, nameFirst: wantsName(st) })
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

export async function openTerm(term, around, anchor, { push = false, midCap = false } = {}) {
    if (push && current) history.push(current); else history = [];
    const my = ++token, mode = S().mode;
    current = { term, around, anchor, midCap, src: mode === 'ai' ? 'ai' : 'wiki', status: {}, data: {}, err: {}, forceLang: '' };
    showCard();
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
    showCard(); position(null); render();
}

export function showEntry(e) {
    history = []; token++;
    const src = e.source === 'ai' ? 'ai' : 'wiki';
    current = { term: e.term || e.title, around: '', anchor: null, midCap: false, src, status: { [src]: 'ok' }, data: { [src]: { ...e } }, err: {}, forceLang: '' };
    showCard(); position(null); render();
}

export function closeCard() {
    token++; history = []; current = null;
    if (card) hideCard();
}

function onAction(act, el) {
    const st = current;
    if (!st) return;
    switch (act) {
        case 'close': closeCard(); break;
        case 'fav': { const e = st.data[st.src]; if (e) { toggleFav(e, st.term); render(); } break; }
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

/** Desktop only: drag the card by its header. */
function enableDrag() {
    const head = card.querySelector('.stp-top');
    let drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    head.addEventListener('pointerdown', e => {
        if (e.button !== 0 || isCoarse() || innerWidth <= 600 || e.target.closest('button')) return;
        const r = card.getBoundingClientRect();
        card.classList.remove('stp-center', 'stp-sheet');
        card.style.left = r.left + 'px'; card.style.top = r.top + 'px';
        sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; drag = true;
        try { head.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        card.classList.add('stp-dragging'); e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
        if (!drag) return;
        const x = Math.max(60 - card.offsetWidth, Math.min(innerWidth - 60, ox + e.clientX - sx));
        const y = Math.max(0, Math.min(innerHeight - 40, oy + e.clientY - sy));
        card.style.left = x + 'px'; card.style.top = y + 'px';
    });
    const end = e => { if (!drag) return; drag = false; card.classList.remove('stp-dragging'); try { head.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
    head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
}

export function initUi() {
    btn = document.createElement('button');
    btn.className = 'stp-q'; btn.type = 'button'; btn.title = t('ask');
    btn.innerHTML = '<span class="stp-qm">?</span><span class="stp-ql"></span>';
    if (hasPopover) btn.setAttribute('popover', 'manual');
    document.body.appendChild(btn);

    card = document.createElement('div');
    card.className = 'stp-card'; card.hidden = true; card.setAttribute('role', 'dialog');
    if (hasPopover) card.setAttribute('popover', 'manual');
    card.innerHTML = `<div class="stp-top"><h2 class="stp-title"></h2><div class="stp-win"><button class="stp-ico" data-act="fav" hidden><i class="fa-regular fa-star"></i></button><button class="stp-ico" data-act="back" title="${esc(t('back'))}" hidden>${ic('arrow-left')}</button><button class="stp-ico" data-act="close" title="${esc(t('close'))}">${ic('xmark')}</button></div></div><div class="stp-tabs"></div><div class="stp-body"></div>`;
    document.body.appendChild(card);

    enableDrag();
    bus.addEventListener('favorites', () => { if (!card.hidden) render(); });

    btn.addEventListener('mousedown', e => { e.preventDefault(); pressing = true; });
    btn.addEventListener('pointerdown', () => { pressing = true; });
    btn.addEventListener('contextmenu', e => e.preventDefault());
    // touch: handle the tap ourselves (touchstart is cancelled so the selection survives and no ghost click follows)
    let tStart = null;
    btn.addEventListener('touchstart', e => { pressing = true; const t0 = e.changedTouches[0]; tStart = { x: t0.clientX, y: t0.clientY }; e.preventDefault(); }, { passive: false });
    btn.addEventListener('touchend', e => {
        e.preventDefault();
        const t0 = e.changedTouches[0];
        if (tStart && Math.abs(t0.clientX - tStart.x) < 24 && Math.abs(t0.clientY - tStart.y) < 24) fireButton();
        tStart = null;
    }, { passive: false });
    btn.addEventListener('touchcancel', () => { tStart = null; });
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); fireButton(); });
    document.addEventListener('pointerup', () => setTimeout(() => { pressing = false; }, 400));

    card.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a) onAction(a.dataset.act, a); });
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerdown', e => {
        if (card.hidden || card.contains(e.target) || btn.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.stp-settings')) return;
        closeCard();
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (!card.hidden) position(current && current.anchor); if (!pressing) onSelectionChange(); });
    // the button must not vanish while a finger is on it (phones fire resize/scroll when the URL bar or selection handles move)
    window.addEventListener('resize', () => { if (!card.hidden) position(current && current.anchor); if (!btn.classList.contains('stp-pill') && !pressing) hideBtn(); onSelectionChange(); });
    window.addEventListener('scroll', () => { if (!btn.classList.contains('stp-pill') && !pressing) hideBtn(); onSelectionChange(); }, true);
}

/** Opens the sample card and shows a report (native alert: works even if the card itself is invisible). */
export async function diagnose() {
    const vv = window.visualViewport, L = [];
    L.push('STpedia diagnostics');
    L.push('UA: ' + navigator.userAgent);
    L.push(`inner ${innerWidth}x${innerHeight}, dpr ${window.devicePixelRatio}, visual ${vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) + ' @' + Math.round(vv.offsetLeft) + ',' + Math.round(vv.offsetTop) : 'n/a'}`);
    L.push(`touchPoints ${navigator.maxTouchPoints}, coarse ${mq('(pointer: coarse)')}, hover ${mq('(hover: hover)')}, popover ${hasPopover}`);
    L.push(`button ${!!btn}, card ${!!card}, enabled ${S().enabled}`);
    try {
        showSample();
        await new Promise(r => setTimeout(r, 400));
        const r = card.getBoundingClientRect(), cs = getComputedStyle(card);
        let open = 'n/a'; try { open = card.matches(':popover-open'); } catch (e) { /* ignore */ }
        L.push(`card rect ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}; display ${cs.display}; visibility ${cs.visibility}; opacity ${cs.opacity}; z ${cs.zIndex}; popoverOpen ${open}`);
        const pts = [[0.5, 0.5], [0.5, 0.15], [0.9, 0.1]];
        pts.forEach(([fx, fy]) => {
            const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
            L.push(`element at ${fx},${fy}: ${el ? el.tagName + '.' + String(el.className).slice(0, 40) : 'null'} | inside card: ${!!(el && card.contains(el))}`);
        });
    } catch (e) { L.push('ERROR: ' + (e && e.message ? e.message : e)); }
    alert(L.join('\n'));
}
