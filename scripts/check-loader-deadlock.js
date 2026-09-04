#!/usr/bin/env node
/**
 * check-loader-deadlock.js — an awaited alert raised while the loading overlay is still up.
 *
 * THE DEFECT
 * ----------
 * Inside one function, `loadingService.show()` has run and an `await`ed alert is raised before any
 * `hide()`. The overlay is mounted ON TOP of the dialog, so OK cannot be clicked; the awaited
 * promise never settles; `finally { hide() }` is textually later and therefore never runs. Neither
 * side can proceed. **The app is frozen, permanently, with no error anywhere.**
 *
 * 🔴 THE SUCCESS PATH IS THE ONE THAT BITES. Measured on the live dashboard: creating an asset-class
 * formula deployed correctly on chain, reported the address, and then hung behind "Submitting
 * data…". A transaction that FULLY SUCCEEDED presents as a frozen app — and the operator's natural
 * response is to retry it. On a formula create that is a wasted deploy; on anything with a money leg
 * it is worse.
 *
 * ⚠️ THREE THINGS THAT ARE **NOT** THE DEFECT — and conflating them is how a scan becomes noise
 * nobody reads:
 *   1. An alert raised BEFORE `show()` — an ordinary confirmation dialog. No loader is up.
 *   2. An UN-awaited alert. Fire-and-forget does not block the `finally`.
 *   3. An alert in a function that never calls `show()` at all.
 *
 * 🔴 AND THAT DISTINCTION IS THE WHOLE JOB. The first pass at finding these used a scanner whose
 * "loader is up" flag leaked ACROSS FUNCTION BOUNDARIES, so case 1 in the *next* function counted as
 * a hit: it reported 79 here and 81 in the Vault. Scoped to a single function body, the real number
 * was **14 across both**. A checker that cries wolf 160 times is one people learn to ignore, which
 * is worse than not having it.
 *
 * THE FIX is `hide()` immediately before the awaited alert. `hide()` is an idempotent signal set, so
 * the `finally` stays as the backstop rather than being replaced by it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src', 'app');

const SHOW = /loadingService\s*\.\s*show\s*\(/;
const HIDE = /loadingService\s*\.\s*hide\s*\(/;
const AWAIT_ALERT = /await\s+(?:[\w.[\]]+\s*=\s*)?this\.alertService\s*\.\s*(\w+)\s*\(/g;
const METHOD = /\n {2}(?:public |private |protected )?(?:async )?([A-Za-z_]\w*)\s*\([^\n]*\)\s*(?::[^\n{]+)?\{/g;

/** Class-method bodies by brace matching. Per-function scope is what keeps this honest. */
function bodies(src) {
    const out = [];
    METHOD.lastIndex = 0;
    let m;
    while ((m = METHOD.exec(src)) !== null) {
        const i = src.indexOf('{', m.index);
        let depth = 0, j = i;
        for (; j < src.length; j++) {
            if (src[j] === '{') depth++;
            else if (src[j] === '}' && --depth === 0) break;
        }
        out.push({ name: m[1], a: i, b: j });
    }
    return out;
}

function walk(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) acc.push(p);
    }
    return acc;
}

const hits = [];
for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const { name, a, b } of bodies(src)) {
        const body = src.slice(a, b);
        const show = SHOW.exec(body);
        if (!show) continue;                       // case 3
        AWAIT_ALERT.lastIndex = 0;
        let am;
        while ((am = AWAIT_ALERT.exec(body)) !== null) {
            if (am.index < show.index + show[0].length) continue;   // case 1
            const between = body.slice(show.index + show[0].length, am.index);
            if (HIDE.test(between)) continue;                        // already cleared
            hits.push({
                file: path.relative(ROOT, file).replace(/\\/g, '/'),
                line: src.slice(0, a + am.index).split('\n').length,
                fn: name,
            });
        }
    }
}

if (hits.length) {
    console.error(`FAIL: ${hits.length} awaited alert(s) raised while the loading overlay is up.\n`
        + `Each one FREEZES the app permanently — the dialog is behind the overlay and OK cannot be\n`
        + `clicked, so the awaited promise never settles and the finally never runs.\n`
        + `FIX: call loadingService.hide() immediately before the alert; keep the finally as backstop.\n`);
    for (const h of hits) console.error(`  ${h.file}:${h.line}  (in ${h.fn})`);
    process.exit(1);
}

console.log('loader/alert deadlock: none — no awaited alert is raised under a live overlay.');
