#!/usr/bin/env node
/**
 * check-v4-recipes.js — the v4 conformance recipes, and one class of defect no
 * other tool in this stack can see.
 *
 * FOUR CHECKS. The last one is the reason this file is worth keeping even after
 * the v4 sweep is a memory.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 4. MALFORMED TAILWIND SPACING UTILITIES  ← the one that earns its keep
 * ─────────────────────────────────────────────────────────────────────────────
 * `py-1.5.5` and `border-transparent.5` are not classes. Tailwind emits NOTHING
 * for an unrecognised class rather than erroring, so:
 *
 *     the production build is GREEN,
 *     the type-checker sees a string,
 *     no linter inspects class SHAPE,
 *     and the only symptom is a control that renders visibly thinner than its
 *     siblings — which nobody reports, because nobody has the sibling on screen
 *     at the same time.
 *
 * Measured 2026-09-16: TWELVE such classes had shipped in the Entity Vault —
 * eleven `py-1.5.5` across the DEX negotiated-trade tab bars and one
 * `border-transparent.5` on the asset Compliance rail — all from a single bad
 * find-and-replace of `py-2.5`. Every one of those tab buttons had zero vertical
 * padding in production. See BUGS.md.
 *
 * This check is independent of v4 and should outlive it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1-3. THE v4 RECIPES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. No hand-rolled tab strip. A tab bar is <app-tabs>; a sub-tab rail is
 *    <app-sub-tab-rail> (frontend Standards 2 and 2.1). Before they existed this
 *    app carried FIVE tab recipes and the Regulator FOUR, across 24 and 27 files,
 *    in two accent colours and two idioms.
 * 2. No v1 breadcrumb band and no page well. The v4 content panel (#f4f6fa) IS
 *    the surface; `bg-gray-200` on top of it is a third tone for no reason.
 * 3. No bare "Loading…" outside <app-loading-state> and the skeleton branches
 *    (Standard 3.4). The two-state `@if (loading()) {…} @else {empty}` prints
 *    "no records" while the answer is still unknown.
 *
 * ⚠️ COMMENTS ARE STRIPPED BEFORE SCANNING, and that is load-bearing rather than
 * tidy: this very file, and the in-source notes that record these defects, quote
 * the offending strings verbatim. A scanner that reads its own documentation as
 * a violation reports a permanent failure nobody can clear.
 *
 * Run with --self-test to check the checker against known-good and known-bad
 * fixtures rather than against the tree.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src', 'app');

/* ── the patterns ─────────────────────────────────────────────────────────── */

// A spacing/colour utility with TWO decimal points: py-1.5.5, transparent.5, mt-0.5.5
const MALFORMED = /(?:^|["'\s])[a-z-]+(?:-[a-z]+)*-?\d*\.\d+\.\d+(?=["'\s]|$)|\btransparent\.\d/g;

// A button that paints its own active TAB state.
//
// ⚠️ THE SIGNAL NAME IS PART OF THE PATTERN, and narrowing to it is what makes
// this check usable. The same `[class.bg-indigo-600]="x() === k"` shape is ALSO
// the v4 SEGMENTED CONTROL — the recipient-kind picker in the document-add
// modals, the block/date toggle on Holders at Block, the documents tab's own
// picker. Those are a different, legitimate component with its own catalog
// entry, and a check that cannot tell them apart reported ten false positives
// against four real ones on its first run. Tab state is `activeTab` / `tab` /
// `rail`; a segmented control binds to what it selects (`recipientKind`,
// `holdersAtMode`), which is exactly the distinction.
const HAND_TAB = /\[class\.(?:bg-blue-600|bg-indigo-600|border-indigo-600|border-blue-600)\]\s*=\s*"\s*(?:activeTab|tab|rail)\(\)|\?\s*'border-(?:indigo|blue)-600 text-(?:indigo|blue)-700/;

const V1_BREADCRUMB = /class="[^"]*border-b bg-gray-200/;
const V1_WELL = /overflow-y-auto bg-gray-200 p-6/;

// Bare loading copy that is neither the shared component nor a skeleton row.
const BARE_LOADING = /\{\{\s*'common\.loading(?:Data)?'\s*\|\s*translate\s*\}\}|>Loading(?:…|&hellip;|\.\.\.)</;

/* ── comment stripping ────────────────────────────────────────────────────── */

function strip(src) {
    return src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
}

/* ── self-test ────────────────────────────────────────────────────────────── */

if (process.argv.includes('--self-test')) {
    const cases = [
        ['malformed: py-1.5.5',        'class="px-4 py-1.5.5 text-xs"',              MALFORMED, true],
        ['malformed: transparent.5',   'class="border border-transparent.5 rounded"', MALFORMED, true],
        ['ok: py-1.5',                 'class="px-4 py-1.5 text-xs"',                 MALFORMED, false],
        ['ok: py-2.5',                 'class="px-4 py-2.5"',                         MALFORMED, false],
        ['ok: w-[18px]',               'class="w-[18px] h-[18px]"',                   MALFORMED, false],
        ['ok: min-w-[200px]',          'class="min-w-[200px]"',                       MALFORMED, false],
        ['hand tab: class binding',    '[class.bg-blue-600]="activeTab() === \'a\'"', HAND_TAB, true],
        ['hand tab: ternary',          "? 'border-indigo-600 text-indigo-700 font-semibold'", HAND_TAB, true],
        ['ok: app-tabs',               '<app-tabs [tabs]="t()" [active]="a()" />',    HAND_TAB, false],
        ['breadcrumb band',            '<div class="px-6 py-4 border-b bg-gray-200">', V1_BREADCRUMB, true],
        ['ok: canvas breadcrumb',      '<div class="px-6 pt-4 pb-3">',                V1_BREADCRUMB, false],
        ['page well',                  'class="flex-1 overflow-y-auto bg-gray-200 p-6"', V1_WELL, true],
        ['bare loading',               "{{ 'common.loading' | translate }}",          BARE_LOADING, true],
        ['ok: loadingKey attribute',   'loadingKey="common.loading"',                 BARE_LOADING, false],
    ];
    let bad = 0;
    for (const [name, sample, re, want] of cases) {
        re.lastIndex = 0;
        const got = re.test(sample);
        const ok = got === want;
        if (!ok) bad++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(28)} matched=${got} want=${want}`);
    }

    // Comment stripping must blind the scanner to its own documentation.
    const doc = '<!-- the old markup carried py-1.5.5, which compiles to nothing -->\n<div class="py-1.5"></div>';
    MALFORMED.lastIndex = 0;
    const leaked = MALFORMED.test(strip(doc));
    console.log(`  ${leaked ? 'FAIL' : 'ok  '}  ${'comment text is not scanned'.padEnd(28)} matched=${leaked} want=false`);
    if (leaked) bad++;

    if (bad) { console.error(`\nself-test FAILED (${bad})`); process.exit(1); }
    console.log('\nself-test passed');
    process.exit(0);
}

/* ── scan ─────────────────────────────────────────────────────────────────── */

function walk(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.name.endsWith('.html') || e.name.endsWith('.ts')) acc.push(p);
    }
    return acc;
}

const SHARED = ['tabs/tabs.component', 'sub-tab-rail/sub-tab-rail.component',
                'loading-state/loading-state.component'];

const findings = { malformed: [], handTab: [], breadcrumb: [], well: [], loading: [] };

for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    // The shared components ARE the recipes; they legitimately contain them.
    if (SHARED.some(s => rel.includes(s))) continue;

    const raw = fs.readFileSync(file, 'utf8');
    const src = strip(raw);
    const lineOf = i => src.slice(0, i).split('\n').length;

    MALFORMED.lastIndex = 0;
    let m;
    while ((m = MALFORMED.exec(src)) !== null) {
        findings.malformed.push({ rel, line: lineOf(m.index), text: m[0].trim() });
    }
    if (!file.endsWith('.html')) continue;

    for (const [key, re] of [['handTab', HAND_TAB], ['breadcrumb', V1_BREADCRUMB],
                             ['well', V1_WELL], ['loading', BARE_LOADING]]) {
        const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        let x;
        while ((x = rx.exec(src)) !== null) {
            const line = src.split('\n')[lineOf(x.index) - 1] || '';
            // A skeleton branch and the component's own bindings are the fix, not the defect.
            if (key === 'loading' && /app-loading-state|loadingKey=|animate-pulse/.test(line)) continue;
            findings[key].push({ rel, line: lineOf(x.index), text: x[0].trim().slice(0, 70) });
        }
    }
}

const LABEL = {
    malformed: 'MALFORMED Tailwind class (compiles to NOTHING — the control silently loses that property)',
    handTab:   'hand-rolled tab/rail state (use <app-tabs> / <app-sub-tab-rail> — Standards 2 / 2.1)',
    breadcrumb:'v1 breadcrumb band (the v4 content panel is the surface — no bg-gray-200)',
    well:      'v1 page well (same reason)',
    loading:   'bare "Loading…" (use <app-loading-state> or skeleton rows — Standard 3.4)',
};

let failed = 0;
for (const key of Object.keys(findings)) {
    const hits = findings[key];
    if (!hits.length) continue;
    failed += hits.length;
    console.error(`\nFAIL (${hits.length}): ${LABEL[key]}`);
    for (const h of hits.slice(0, 40)) console.error(`  ${h.rel}:${h.line}  ${h.text}`);
    if (hits.length > 40) console.error(`  … and ${hits.length - 40} more`);
}

if (failed) { console.error(`\n${failed} v4-recipe violation(s).`); process.exit(1); }
console.log('v4 recipes: clean — one tab recipe, one rail recipe, one loading vocabulary, no malformed classes.');
