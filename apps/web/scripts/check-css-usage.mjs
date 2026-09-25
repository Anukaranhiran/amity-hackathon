// CSS↔TSX cross-check: every class defined in styles.css must be reachable
// from a className in the TSX sources (static or in a template literal),
// or be a known state/element hook.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir) {
    return readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
    }).filter((p) => p.endsWith('.tsx') || p.endsWith('.ts'));
}

const src = walk(SRC).map((p) => readFileSync(p, 'utf8')).join('\n');
const css = readFileSync(new URL('../src/styles.css', import.meta.url).pathname, 'utf8');

// Classes used statically
const used = new Set();
for (const m of src.matchAll(/className="([^"]+)"/g)) {
    m[1].split(/\s+/).forEach((c) => used.add(c));
}

// Literal class fragments inside template literals (`... ${cond} ...`)
for (const m of src.matchAll(/className=\{`([^`]+)`\}/g)) {
    const lit = m[1].replace(/\$\{[^}]*\}/g, ' ').replace(/['"]/g, '');
    lit.split(/\s+/).forEach((c) => {
        if (/^[a-z][a-z0-9-]*$/i.test(c)) used.add(c);
    });
}

// Classes defined in the stylesheet
const defined = new Set();
for (const m of css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]+)/g)) {
    defined.add(m[1]);
}

// Modifiers / element hooks applied conditionally or via parent selectors
const state = new Set([
    'active', 'collapsed', 'hoverable', 'done', 'ok', 'err', 'warn', 'bad', 'good',
    'info', 'critical', 'high', 'medium', 'low', 'get', 'post', 'put', 'patch',
    'delete', 'other', 'confirmed', 'potential', 'pass', 'fail', 'inconclusive',
    'error', 'skipped', 'selected', 'tall', 'primary', 'secondary', 'up', 'down',
    'delta', 'lbl', 'ev', 'ts', 'tag', 'n', 'l', 'trend', 'between', 'flush',
    'redacted', 'green', 'red', 'cyan', 'wide',
]);

const unused = [...defined].filter((c) => !used.has(c) && !state.has(c));
console.log(unused.length ? 'UNUSED CSS CLASSES:\n' + unused.join('\n') : 'All CSS classes are reachable from TSX. ✓');
