#!/usr/bin/env node
/**
 * check-modal-render.js — a modal component DECLARED in `imports` and never PLACED in the template.
 *
 * THE INVARIANT
 * -------------
 * **Every `Modal*Component` in a component's `imports` array has its element in that component's
 * template.** Stated as the invariant rather than as the defect, deliberately: a check named after
 * the bug you just hit finds only that bug.
 *
 * THE DEFECT IT CATCHES
 * ---------------------
 * A standalone component lists a modal in `imports` and never places `<app-modal-x />`. The modal
 * never mounts, so `modalService.show()` returns a promise that **nothing will ever resolve** and
 * the button that opened it hangs forever. No error, no warning, no failed request.
 *
 * 🔴 `tsc` AND `ng build` CANNOT SEE THIS, AND NOT BY ACCIDENT. An imported-but-unplaced component
 * is perfectly valid TypeScript — the class is coherent, the template is coherent, every type
 * checks. The defect lives in the RELATIONSHIP between two files that the type system does not
 * model. Measured on this dashboard 2026-09-05: the Service Details page declared
 * `ModalLicenseGrantComponent`, rendered it zero times, and `npm run build` **exited 0** while
 * every "Grant Licence" click would have hung.
 *
 * That is why this is a script and not a lint rule of the compiler's: no amount of running the
 * compiler more carefully, or scoping it better, surfaces a dimension it does not model. When a
 * change spans two artefacts, ask which tool spans them — and if none does, the check is this one.
 *
 * ⚠️ THE SELECTOR IS READ, NEVER DERIVED. `ModalLicenseGrantComponent` → `app-modal-license-grant`
 * is a convention, not a rule, and a checker that mangles names would silently miss any component
 * that names its selector differently. Each modal's own `@Component({ selector })` is the source.
 *
 * Run with --self-test to prove it can FAIL: a checker that has only ever been seen passing is one
 * nobody knows can refuse.
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src', 'app');

function walk(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) acc.push(p);
    }
    return acc;
}

/** Blank comments so a selector or an element mentioned in prose is never counted as code. */
function blankComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/** className -> selector, harvested from every `@Component` in the tree. */
function selectorMap(files) {
    const map = new Map();
    for (const f of files) {
        const src = blankComments(fs.readFileSync(f, 'utf8'));
        const re = /@Component\s*\(\s*\{([\s\S]*?)\}\s*\)\s*export\s+class\s+([A-Za-z0-9_$]+)/g;
        let m;
        while ((m = re.exec(src))) {
            const sel = /selector\s*:\s*['"]([^'"]+)['"]/.exec(m[1]);
            if (sel) map.set(m[2], sel[1]);
        }
    }
    return map;
}

/** The `imports: [...]` entries and the templateUrl of each component in a file. */
function componentsIn(file) {
    const src = blankComments(fs.readFileSync(file, 'utf8'));
    const out = [];
    const re = /@Component\s*\(\s*\{([\s\S]*?)\}\s*\)\s*export\s+class\s+([A-Za-z0-9_$]+)/g;
    let m;
    while ((m = re.exec(src))) {
        const meta = m[1];
        const imp = /imports\s*:\s*\[([\s\S]*?)\]/.exec(meta);
        if (!imp) continue;
        const declared = imp[1]
            .split(',').map((s) => s.trim()).filter(Boolean)
            .filter((s) => /^Modal[A-Za-z0-9_$]*Component$/.test(s));
        if (!declared.length) continue;
        const tpl = /templateUrl\s*:\s*['"]([^'"]+)['"]/.exec(meta);
        const inline = /template\s*:\s*[`'"]/.test(meta);
        out.push({ cls: m[2], declared, templateUrl: tpl ? tpl[1] : null, inline });
    }
    return out;
}

function audit(fileOverrides = {}) {
    const files = walk(ROOT);
    const read = (p) => (Object.prototype.hasOwnProperty.call(fileOverrides, p) ? fileOverrides[p] : fs.readFileSync(p, 'utf8'));

    const selectors = selectorMap(files);
    const problems = [];
    let checkedComponents = 0;
    let checkedModals = 0;

    for (const f of files) {
        // componentsIn reads from disk; for the self-test we re-parse the overridden text instead.
        const srcForParse = read(f);
        const saved = fs.readFileSync;
        let comps;
        try {
            fs.readFileSync = (p, enc) => (p === f ? srcForParse : saved(p, enc));
            comps = componentsIn(f);
        } finally { fs.readFileSync = saved; }

        for (const c of comps) {
            if (c.inline || !c.templateUrl) continue;   // inline templates are in the same file
            const tplPath = path.resolve(path.dirname(f), c.templateUrl);
            if (!fs.existsSync(tplPath)) continue;
            const tpl = blankComments(read(tplPath));
            checkedComponents++;
            for (const name of c.declared) {
                checkedModals++;
                const sel = selectors.get(name);
                if (!sel) {
                    problems.push(`${path.relative(ROOT, f)}: ${c.cls} declares ${name}, whose @Component selector could not be read`);
                    continue;
                }
                if (!new RegExp(`<${sel}[\\s/>]`).test(tpl)) {
                    problems.push(
                        `${path.relative(ROOT, f)}: ${c.cls} declares ${name} but its template never places <${sel}> — `
                        + 'the modal cannot mount, so show() returns a promise nothing resolves and the caller hangs');
                }
            }
        }
    }
    return { problems, checkedComponents, checkedModals };
}

/* ── self-test ──────────────────────────────────────────────────────────────────────────── */

function selfTest() {
    const files = walk(ROOT);
    // Find any component that DOES render a modal, and remove that one element.
    for (const f of files) {
        const comps = componentsIn(f);
        for (const c of comps) {
            if (c.inline || !c.templateUrl) continue;
            const tplPath = path.resolve(path.dirname(f), c.templateUrl);
            if (!fs.existsSync(tplPath)) continue;
            const selectors = selectorMap(files);
            for (const name of c.declared) {
                const sel = selectors.get(name);
                if (!sel) continue;
                const tpl = fs.readFileSync(tplPath, 'utf8');
                const re = new RegExp(`<${sel}[\\s/>][^>]*>(\\s*</${sel}>)?`);
                if (!re.test(tpl)) continue;
                const mutated = tpl.replace(re, '');
                // ⚠️ ASSERT THE MUTATION APPLIED. A `.replace()` that matches nothing yields an
                // unchanged file and a checker that "passes" — the exact false pass this exists to
                // prevent, and one that has already bitten this project.
                if (mutated === tpl) continue;
                const { problems } = audit({ [tplPath]: mutated });
                const caught = problems.some((p) => p.includes(name));
                console.log(caught
                    ? `  ✅ caught: <${sel}> removed from ${path.basename(tplPath)} → refused, naming ${name}`
                    : `  ❌ MISSED: <${sel}> removed from ${path.basename(tplPath)} and the checker still passed`);
                return caught ? 0 : 1;
            }
        }
    }
    console.log('  ❌ self-test could not run: no rendered modal found to remove');
    return 1;
}

/* ── main ───────────────────────────────────────────────────────────────────────────────── */

const { problems, checkedComponents, checkedModals } = audit();

if (problems.length) {
    console.log(`modal render: ${problems.length} declared-but-unrendered modal(s)`);
    problems.forEach((p) => console.log('  • ' + p));
} else {
    console.log(`modal render: none — ${checkedModals} modal declaration(s) across ${checkedComponents} component(s) all have their element.`);
}

let failed = problems.length ? 1 : 0;
if (process.argv.includes('--self-test')) {
    console.log('\nSELF-TEST (the checker must refuse a known-broken tree)');
    failed += selfTest();
}

process.exit(failed ? 1 : 0);
