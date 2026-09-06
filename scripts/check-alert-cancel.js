#!/usr/bin/env node
/**
 * check-alert-cancel.js — an alert whose answer nobody reads must not offer Cancel.
 *
 * ─── 🔴 THE PROOF THIS RESTS ON ──────────────────────────────────────────────────────────────
 * **If the returned boolean is DISCARDED, the dialog cannot be a question.** `cancel()` and
 * `confirm()` both resolve a promise nobody reads, so the two buttons do exactly the same thing —
 * and one of them is labelled as if it declines something. A user who presses Cancel on a failed
 * upload believes they have cancelled it. Nothing was cancelled; there was nothing to cancel.
 *
 * That is a proof rather than a heuristic, which is what makes this checkable at all: judging
 * "does this feel informational" cannot be automated, but "is the result used" can.
 *
 * ─── WHY A CHECKER AND NOT JUST A SWEEP ──────────────────────────────────────────────────────
 * ⚠️ This regrew once already. An earlier pass fixed 4 sites, wrote down that the rest were
 * unswept, and the note sat in a phase record for weeks while the count reached 277. A sweep with
 * no guard is a sweep that has to be repeated; the next person writes the same note.
 *
 * ─── WHAT IT DOES NOT FLAG ───────────────────────────────────────────────────────────────────
 * ⚠️ A site that CONSUMES the boolean is a real confirmation and is left alone. Removing Cancel
 * there would remove the ability to decline a destructive action — the actual harm the original
 * note was about, and the opposite mistake to the one this fixes.
 *
 * Usage:  node scripts/check-alert-cancel.js [--self-test]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src', 'app');

/** Comment-safe enough for this job: only line comments can hide a call on its own line. */
function stripLineComments(src) {
    return src.split('\n').map((l) => {
        const i = l.indexOf('//');
        if (i < 0) return l;
        // don't cut inside a string — crude but the only false positive is keeping a comment,
        // which costs nothing here (a commented-out call is not a call site).
        const before = l.slice(0, i);
        const q = (before.match(/'/g) || []).length + (before.match(/"/g) || []).length
                + (before.match(/`/g) || []).length;
        return q % 2 === 0 ? before : l;
    }).join('\n');
}

/**
 * Is this `.show(` call's result CONSUMED?
 *
 * 🔴 THE PAREN-BALANCE TEST IS THE LOAD-BEARING PART. `if (await alertService.show(...))` consumes
 * it; `if (r?.error) alertService.show(...)` does not — and the two look identical to a prefix
 * regex, because both have `if (` to the left. The difference is whether the parens OPEN before
 * the call are still unclosed at it: in the first the call sits INSIDE the condition, in the
 * second the condition already closed and the call is the body.
 *
 * ⚠️ Without this, 74 discards look ambiguous and a reviewer waves them through.
 */
function consumesResult(line, callIndex) {
    const before = line.slice(0, callIndex);

    // assignment / return / direct use
    if (/(?:const|let|var)\s+[\w{}[\],\s]+=\s*(?:await\s+)?$/.test(before)) return true;
    if (/(?:return|=|\?|&&|\|\||!)\s*(?:await\s+)?$/.test(before.replace(/this\.$/, ''))) return true;

    // inside an open condition — count unclosed parens to the left
    let depth = 0;
    for (const c of before) { if (c === '(') depth++; else if (c === ')') depth--; }
    if (depth > 0 && /\b(if|while|switch)\s*\($/.test(before.replace(/[^()]*$/, '').trim() + '(')) return true;
    if (depth > 0) return true;      // any unclosed paren means the call is an operand

    return false;
}

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.ts')) out.push(p);
    }
    return out;
}

/** Offending sites: `.show(` on an alert service whose boolean goes nowhere. */
function scan(root) {
    const bad = [];
    for (const file of walk(root)) {
        const src = stripLineComments(fs.readFileSync(file, 'utf8'));
        const lines = src.split('\n');
        lines.forEach((line, i) => {
            const m = /alert(?:Service)?\.show\s*\(/i.exec(line);
            if (!m) return;
            if (consumesResult(line, m.index)) return;
            bad.push({ file: path.relative(path.join(__dirname, '..'), file), line: i + 1, text: line.trim().slice(0, 100) });
        });
    }
    return bad;
}

if (process.argv.includes('--self-test')) {
    /*
        ⚠️ NON-CIRCULAR BY CONSTRUCTION: these are hand-written cases whose correct answer is known
        WITHOUT asking the checker, including the two shapes that broke the original classifier.
    */
    const cases = [
        ['discard, bare',              `    this.alertService.show('a','b');`,                      false],
        ['discard, awaited',           `    await this.alertService.show('a','b');`,                false],
        ['discard, as an if BODY',     `    if (r?.error) this.alertService.show('a', r.error);`,   false],
        ['consumed by const',          `    const ok = await this.alertService.show('a','b');`,     true],
        ['consumed as an if CONDITION',`    if (await this.alertService.show('a','b')) { go(); }`,  true],
        ['consumed by return',         `    return this.alertService.show('a','b');`,               true],
        ['consumed by &&',             `    const g = x && await this.alertService.show('a','b');`, true],
    ];
    let bad = 0;
    for (const [label, line, wantConsumed] of cases) {
        const m = /alert(?:Service)?\.show\s*\(/i.exec(line);
        const got = consumesResult(line, m.index);
        const ok = got === wantConsumed;
        if (!ok) bad++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(30)} consumed=${got}`);
    }
    // The mutation test: a checker that always answered "consumed" would pass every case above
    // that expects true. Prove it distinguishes by requiring at least one of each answer.
    const answers = cases.map(([, l]) => consumesResult(l, /alert(?:Service)?\.show\s*\(/i.exec(l).index));
    if (!answers.includes(true) || !answers.includes(false)) {
        console.log('  FAIL  the classifier returned one answer for everything'); bad++;
    } else {
        console.log('  ok    it actually distinguishes the two shapes');
    }
    console.log(bad ? `\nself-test: ${bad} FAILED` : '\nself-test passed');
    process.exit(bad ? 1 : 0);
}

const bad = scan(ROOT);
if (bad.length) {
    console.log(`alert cancel: ${bad.length} dialog(s) offer Cancel but discard the answer.`);
    console.log('Use `alertService.info(...)` — same dialog, one button. A Cancel nobody can act on');
    console.log('tells a user they declined something when nothing was declined.\n');
    for (const b of bad.slice(0, 25)) console.log(`  ${b.file}:${b.line}  ${b.text}`);
    if (bad.length > 25) console.log(`  … and ${bad.length - 25} more`);
    process.exit(1);
}
console.log('alert cancel: every discarded-result dialog uses info()');
