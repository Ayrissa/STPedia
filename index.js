/**
 * STpedia — a pocket encyclopedia for SillyTavern chats.
 * Select a word or phrase in a message, tap "?", and get a Wikipedia-style card
 * from Wikipedia (real terms and people) or from an AI-written in-world encyclopedia.
 * Author: Ayrissa. License: MIT.
 *
 * Privacy: STpedia never reads SillyTavern's API keys. The AI mode uses a Connection Manager profile
 * (the request is made by SillyTavern itself) or STpedia's own API settings.
 */
import { S, DEFAULTS, fillDefaults, bus } from './core.js';
import { initUi, closeCard } from './ui.js';
import { initSettings } from './settings.js';

function safe(label, fn) {
    try { fn(); } catch (e) {
        console.error(`[STpedia] ${label} failed`, e);
        try { toastr.error(`STpedia (${label}): ${e && e.message ? e.message : e}`); } catch (er) { /* ignore */ }
    }
}

/** Waits for a SillyTavern element (mobile layouts can build them later). */
function whenReady(selector, fn, tries = 80) {
    if (document.querySelector(selector)) return safe(selector, fn);
    if (tries > 0) setTimeout(() => whenReady(selector, fn, tries - 1), 500);
}

function boot() {
    safe('settings', () => {
        fillDefaults(S(), DEFAULTS);
        const w = S().wiki;
        if (w.names === 'smart' || w.names === 'always') w.names = 'name'; // values of 0.2.x
    });
    whenReady('#extensions_settings2', initSettings);
    safe('ui', initUi);
    bus.addEventListener('enabled', () => { if (!S().enabled) closeCard(); });
}

window.addEventListener('error', e => {
    if (/stpedia/i.test(String(e.filename || ''))) { try { toastr.error(`STpedia: ${e.message}`); } catch (er) { /* ignore */ } }
});
window.addEventListener('unhandledrejection', e => {
    const st = String((e.reason && e.reason.stack) || '');
    if (/stpedia/i.test(st)) { try { toastr.error(`STpedia: ${(e.reason && e.reason.message) || e.reason}`); } catch (er) { /* ignore */ } }
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
