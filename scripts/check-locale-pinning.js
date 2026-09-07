#!/usr/bin/env node
/**
 * check-locale-pinning.js — no number may be formatted in the VIEWER's locale.
 *
 * ─── 🔴 THE DEFECT, AND WHY IT SURVIVED ──────────────────────────────────────────────────────
 * `toLocaleString(undefined, …)` resolves to the **viewer's** locale. Every shared helper on this
 * platform deliberately pins `en-US` — `MoneyPipe`, `UtilsService.formatPrice`, `.formatTokens` —
 * and the pipe's own comment records why: the app registers no locale, so Angular's `LOCALE_ID`
 * is en-US and a `| money` value is formatted that way regardless of who is looking.
 *
 * So a per-page `fmtAmount` passing `undefined` disagrees with the `| money` value **in the same
 * table row**: `1,234` against `1.234` (de-DE) or `١٬٢٣٤` (ar-EG). Both apps ship an Arabic UI.
 *
 * ⚠️ IT IS INVISIBLE TO EVERY DEVELOPER RUNNING AN en-US BROWSER, which is the whole reason 31
 * sites accumulated across two apps. There is no wrong output to notice — the bug is in a
 * dimension the author cannot see from their own machine.
 *
 * A bare `toLocaleString()` is the same defect twice over: it takes the viewer's locale AND the
 * locale's default fraction digits, so a token quantity can render with decimals it does not have.
 *
 * This is the NUMBER analogue of the platform's existing date rule (frontend Standard 6: no
 * locale-dependent date formatter anywhere, route through the shared helper).
 *
 * ─── WHAT IS ALLOWED ─────────────────────────────────────────────────────────────────────────
 *   ✅ `toLocaleString('en-US', { … })`   — explicit, matches every shared helper
 *   ✅ the shared helpers themselves       — `| money`, `formatPrice`, `formatTokens`
 *   ❌ `toLocaleString(undefined, { … })`  — the viewer's locale
 *   ❌ `toLocaleString()`                  — the viewer's locale AND their default digits
 *
 * ⓘ Pinning the LOCALE is not the same as routing through a helper, and this check deliberately
 * asks only for the first. `formatPrice` also rounds to the tenant's `CURRENCY_DECIMALS`, which is
 * correct for money and WRONG for a token quantity (`fmtAmount` sites use
 * `maximumFractionDigits: 0` because token quantities are integers platform-wide). Demanding the
 * helper here would silently change displayed precision on ~20 pages; demanding the locale fixes
 * the defect and changes nothing else.
 *
 * Usage:  node scripts/check-locale-pinning.js [--self-test]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/** Both apps, so one check covers the platform rather than each app half-covering it. */
const ROOTS = [
    path.join(__dirname, '..', 'src', 'app'),
    path.join(__dirname, '..', '..', '..', '..', 'Tarmiiz Regulator', 'Frontends', 'Regulator Dashboard', 'src', 'app'),
];

const BAD = /\.toLocaleString\(\s*(?:undefined\s*[,)]|\))/g;

function walk(dir, out = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p);
    }
    return out;
}

function offendersIn(src) {
    return [...src.matchAll(BAD)].map((m) => src.slice(0, m.index).split('\n').length);
}

if (process.argv.includes('--self-test')) {
    let bad = 0;
    const check = (label, got, want) => {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        if (!ok) bad++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `   got ${JSON.stringify(got)}`}`);
    };
    check('flags undefined with options', offendersIn("n.toLocaleString(undefined, { x: 1 })"), [1]);
    check('flags a bare call',            offendersIn("n.toLocaleString()"), [1]);
    check('flags undefined alone',        offendersIn("n.toLocaleString(undefined)"), [1]);
    // 🔴 The cases that must NOT fire — a check that flags correct code gets switched off.
    check('allows an explicit en-US',     offendersIn("n.toLocaleString('en-US', { x: 1 })"), []);
    check('allows another explicit tag',  offendersIn("n.toLocaleString('de-DE')"), []);
    check('allows a variable locale',     offendersIn("n.toLocaleString(loc, { x: 1 })"), []);
    check('reports the right line',       offendersIn("a\nb\nn.toLocaleString()"), [3]);
    console.log(bad ? `\nself-test: ${bad} FAILED` : '\nself-test passed');
    process.exit(bad ? 1 : 0);
}

let scanned = 0;
const hits = [];
for (const root of ROOTS) {
    const files = walk(root);
    scanned += files.length;
    for (const f of files) {
        for (const line of offendersIn(fs.readFileSync(f, 'utf8'))) {
            hits.push(`${path.relative(path.join(root, '..', '..', '..'), f)}:${line}`);
        }
    }
}

console.log(`  .ts files scanned across both apps : ${scanned}`);
console.log(`  formatting in the VIEWER's locale  : ${hits.length}`);
for (const h of hits) console.log(`    ${h}`);

// An empty scan means the roots moved, NOT that the code is clean. Reporting "0 offenders" on a
// scan that saw no files is the failure mode this platform keeps hitting — a locale-rejected
// `grep -P` that returned 0 keys and 20 false orphans, a comment-stripper that ate 20 of 388
// routes. A check that cannot see its subject must refuse to report on it.
if (scanned === 0) {
    console.error('\nFAIL: scanned ZERO files — a source root has moved.');
    console.error('      This is a path failure, not a clean result. Fix the roots before reading it.');
    process.exit(1);
}

if (hits.length) {
    console.log("\n⚠️ Each of these formats in the viewer's locale, so it can disagree with a");
    console.log('   `| money` value in the SAME table row on a non-en-US browser — and both apps');
    console.log("   ship an Arabic UI. Pass 'en-US' explicitly, keeping the existing digit options.");
    process.exit(1);
}
console.log('\nlocale pinning: every number formatter names its locale');
