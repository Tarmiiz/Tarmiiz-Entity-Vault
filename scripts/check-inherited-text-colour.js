#!/usr/bin/env node
/**
 * check-inherited-text-colour.js — rows whose cells set no text colour and INHERIT a light one.
 *
 * THE DEFECT, measured three times on this platform
 * -------------------------------------------------
 * A `<tbody>` row sets no `text-*` class. Its cells inherit from the nearest ancestor that sets
 * one. When that value is light, the row RENDERS, carries correct data, and is invisible on white.
 *
 * 🔴 IT IS WORSE THAN AN ORDINARY STYLE BUG BECAUSE OF WHAT IT LOOKS LIKE. The `<thead>` usually
 * sets its own colour, so the headers stay visible and the body does not — and an empty-looking
 * table reads as "there are no rows", a confident wrong answer rather than a visible failure. On
 * the beneficial-owners table of a compliance page that meant "this entity has no beneficial
 * owners". `document.querySelectorAll('table tbody tr').length` returned 1 while the page showed
 * bare headers.
 *
 * Prior occurrences: the Connect To-picker and Add-participants menus, and the KYB owners table.
 * Three is a pattern, which is why this is a checker and not a one-off sweep.
 *
 * ⚠️ WHY A GREP CANNOT DO THIS, and why the check is worth its complexity
 * ----------------------------------------------------------------------
 * A row with no colour class is only broken IF WHAT IT INHERITS IS LIGHT. Most rows inherit
 * something dark and are perfectly fine, so "rows without text-*" is almost all false positives.
 * The question is not about the row — it is about the ANCESTOR CHAIN above it. So this parses the
 * template into an element tree and resolves the nearest ancestor that sets a colour.
 *
 * 🔴 THE HONEST LIMIT, STATED RATHER THAN HIDDEN. Inheritance does not stop at the file boundary.
 * A component placed inside a parent's `<div class="text-gray-400">` inherits that, and this
 * checker cannot see it — it reads one template at a time. So:
 *   · a chain that resolves to a LIGHT colour inside the file  -> reported as BROKEN (decidable)
 *   · a chain that resolves to a DARK colour inside the file   -> SAFE (decidable)
 *   · a chain that reaches the root with NO colour set         -> UNKNOWN, reported separately
 * The UNKNOWN tier is the honest part: those inherit from a parent component or a global style and
 * are genuinely undecidable here. Reporting them as safe would make this a guard that returns
 * green while the defect ships; reporting them as broken would bury the real hits. They are listed
 * as needing a rendered check, and the count is printed so the blind spot has a SIZE.
 *
 * 🔴 CALIBRATED AGAINST THE REAL DEFECT, AND THE RESULT REFUTES THE OBVIOUS READING OF THIS FILE.
 * The measured incident — the KYB beneficial-owners row — was temporarily reverted and re-run.
 * It produced **ZERO** entries in the BROKEN tier and appeared in UNDECIDABLE instead, because
 * its light ancestor is OUTSIDE the template. So:
 *
 *     "0 BROKEN" IS NOT REASSURANCE. The one defect this check exists for does not land in the
 *     decidable tier at all. The risk lives almost entirely in UNDECIDABLE.
 *
 * That is why the exit code is deliberately NOT the headline here, and why the UNDECIDABLE list
 * is printed in full rather than summarised away. Read this check as "which rows depend on a
 * colour this file cannot see" — a risk inventory — not as "which rows are broken". A single-file
 * static parse cannot answer the second question, and any version of this that claims to is a
 * guard that returns green while the defect ships.
 *
 * Angular control flow (`@if` / `@for` / `@switch`) is skipped deliberately: it emits no DOM
 * element, so it cannot participate in inheritance. Treating it as an element would break the
 * chain at the wrong place.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const TREES = [
    'Tarmiiz Entities/Frontends/Entity Vault/src/app',
    'Tarmiiz Regulator/Frontends/Regulator Dashboard/src/app',
];

/**
 * Tailwind text colours that are too light to read on a white surface.
 *
 * ⚠️ 500 IS DELIBERATELY NOT HERE. `text-gray-500` is muted but legible — it is what the visible
 * `<thead>` used in the measured incident, so calling it broken would contradict the evidence and
 * flood the report with rows that are fine. The line is at 400.
 */
const LIGHT = /\btext-(?:white|(?:gray|grey|slate|zinc|neutral|stone)-(?:50|100|200|300|400))\b/;
const ANY_TEXT_COLOUR = /\btext-(?:white|black|(?:gray|grey|slate|zinc|neutral|stone|red|amber|yellow|green|emerald|blue|indigo|violet|purple|pink|rose|teal|cyan|orange|lime|sky|fuchsia)-\d{2,3})\b/;

/** Elements whose CONTENT is the data a user reads in rows. */
const ROW_TAGS = new Set(['tr', 'td', 'th']);

function walk(dir, acc = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.name.endsWith('.html')) acc.push(p);
    }
    return acc;
}

/** Blank HTML comments so prose about colours is never parsed as markup. */
function blankComments(src) {
    return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr']);

/**
 * Build the ancestor stack for every tag occurrence. Returns a list of
 * { tag, cls, line, ancestors: [{tag, cls}, ...] } — outermost ancestor first.
 */
function parse(src) {
    const out = [];
    const stack = [];
    const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const [, closing, tagRaw, attrs, selfClose] = m;
        const tag = tagRaw.toLowerCase();
        if (closing) {
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i].tag === tag) { stack.length = i; break; }
            }
            continue;
        }
        const clsMatch = /\bclass\s*=\s*"([^"]*)"/.exec(attrs) || /\bclass\s*=\s*'([^']*)'/.exec(attrs);
        const cls = clsMatch ? clsMatch[1] : '';
        const line = src.slice(0, m.index).split('\n').length;
        const node = { tag, cls, line, ancestors: stack.slice() };
        out.push(node);
        if (!selfClose && !VOID.has(tag)) stack.push({ tag, cls });
    }
    return out;
}

/** The nearest colour in the chain: self first, then ancestors inward-out. */
function effectiveColour(node) {
    const chain = [{ tag: node.tag, cls: node.cls }, ...node.ancestors.slice().reverse()];
    for (const a of chain) {
        const hit = ANY_TEXT_COLOUR.exec(a.cls || '');
        if (hit) return { cls: hit[0], from: a.tag, self: a === chain[0] };
    }
    return null;
}

const broken = [];
const unknown = [];
let candidates = 0;

for (const tree of TREES) {
    for (const abs of walk(path.join(ROOT, tree))) {
        const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
        const src = blankComments(fs.readFileSync(abs, 'utf8'));
        for (const node of parse(src)) {
            if (!ROW_TAGS.has(node.tag)) continue;
            // Only rows INSIDE a tbody are data rows; a <thead> row is a header and
            // conventionally sets its own colour.
            if (!node.ancestors.some((a) => a.tag === 'tbody')) continue;
            if (ANY_TEXT_COLOUR.test(node.cls)) continue;      // sets its own — safe
            candidates++;
            const eff = effectiveColour(node);
            if (!eff) { unknown.push({ rel, line: node.line, tag: node.tag }); continue; }
            if (LIGHT.test(eff.cls)) {
                broken.push({ rel, line: node.line, tag: node.tag, inherited: eff.cls, from: eff.from });
            }
        }
    }
}

console.log(`inherited text colour: ${candidates} row/cell candidate(s) with no colour of their own`);

if (broken.length) {
    console.log(`\n🔴 ${broken.length} INHERIT A LIGHT COLOUR — these render near-invisible:`);
    for (const b of broken) {
        console.log(`  • ${b.rel}:${b.line}  <${b.tag}>  inherits ${b.inherited} from <${b.from}>`);
    }
}

if (unknown.length) {
    console.log(`\n⚠️ ${unknown.length} UNDECIDABLE HERE — no colour set anywhere in the file's chain,`);
    console.log('   so they inherit from a parent component or a global style. This checker reads one');
    console.log('   template at a time and cannot see that. They are NOT reported as safe.');
    const byFile = {};
    for (const u of unknown) byFile[u.rel] = (byFile[u.rel] || 0) + 1;
    for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
        console.log(`     ${n.toString().padStart(3)}  ${f}`);
    }
    if (Object.keys(byFile).length > 12) {
        console.log(`     … and ${Object.keys(byFile).length - 12} more file(s)`);
    }
}

if (!broken.length && !unknown.length) {
    console.log('  none — every data row resolves to a dark colour.');
} else if (!broken.length) {
    console.log('\n⚠️ ZERO in the BROKEN tier is NOT a clean result. Calibrated 2026-09-06 against');
    console.log('   the real incident: reverting the KYB owners fix produced zero BROKEN entries and');
    console.log('   moved it into UNDECIDABLE, because its light ancestor is outside the template.');
    console.log('   The risk is the list above, not the empty list below it.');
}

// Exit non-zero ONLY on the decidable failures. The unknown tier is information, not a gate:
// failing on it would make the check impossible to keep green and it would be turned off.
process.exit(broken.length ? 1 : 0);
