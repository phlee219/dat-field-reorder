// tests/run_dom_flow.mjs
// DOM-stub harness: loads the WHOLE inline <script> of field_mapper.html inside a
// minimal DOM sandbox (Node), then drives the real loadFile -> saveFileCore flow and
// asserts the app initialises, loads a FE/DC4 file, and saves it WITHOUT the
// fail-closed diagnostics tripping. Run: node tests/run_dom_flow.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../field_mapper.html', import.meta.url), 'utf8');
const ws0 = html.indexOf('<script>') + '<script>'.length;
const ws1 = html.indexOf('</script>');
if (ws0 < 8 || ws1 <= ws0) { console.error('script block not found'); process.exit(2); }
const script = html.slice(ws0, ws1);

function classListStub(){
  return { add(){}, remove(){}, contains(){ return false; }, toggle(){ return false; } };
}
function makeEl(tag){
  return {
    tagName: (tag || 'div').toUpperCase(), nodeType: 1, style: {}, dataset: {},
    children: [], options: [], value: '', checked: false, disabled: false,
    textContent: '', innerHTML: '', title: '', hidden: false, type: '', name: '',
    className: '', selectedIndex: -1, files: null, classList: classListStub(),
    addEventListener(){}, removeEventListener(){},
    appendChild(c){ this.children.push(c); return c; },
    append(...cs){ this.children.push(...cs); }, prepend(){},
    remove(){}, click(){}, focus(){}, blur(){}, reset(){}, scrollIntoView(){},
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    contains(){ return false; }, closest(){ return null; }, matches(){ return false; },
    querySelector(){ return makeEl('div'); }, querySelectorAll(){ return []; },
    insertBefore(){}, replaceChildren(){ this.children = []; }, cloneNode(){ return makeEl(tag); },
    dispatchEvent(){ return true; }
  };
}
const elCache = new Map();
function getEl(id){
  if(!elCache.has(id)) elCache.set(id, makeEl('div'));
  return elCache.get(id);
}
const documentStub = {
  body: makeEl('body'), title: '',
  getElementById: getEl,
  querySelector(sel){
    const m = /#([\w-]+)/.exec(String(sel));
    return m ? getEl(m[1]) : makeEl('div');
  },
  querySelectorAll(){ return []; },
  createElement: (t) => makeEl(t),
  addEventListener(){}, removeEventListener(){},
  createTextNode: (t) => ({ textContent: String(t) })
};
documentStub.documentElement = makeEl('html');
// ---- sandbox globals -------------------------------------------------------
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  TextEncoder, TextDecoder, Uint8Array, Uint16Array, Uint32Array, DataView, ArrayBuffer,
  Set, Map, WeakMap, Math, Number, String, Boolean, Object, Array, RegExp, JSON, Date,
  Promise, Error, TypeError, RangeError, Symbol, parseInt, parseFloat, isNaN,
  Blob, File, URL, fetch, crypto,
  navigator: { clipboard: { writeText: async () => {} }, userAgent: 'node-stub' },
  location: { href: 'about:blank', protocol: 'file:' },
  localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  history: { pushState(){}, replaceState(){} },
  matchMedia(){ return { matches: false, addListener(){}, removeListener(){} }; },
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  alert(){}, confirm(){ return true; }, prompt(){ return ''; },
  Option: function(text, value){ const e = makeEl('option'); e.text = String(text); e.textContent = String(text); e.value = value == null ? '' : String(value); return e; },
  document: documentStub,
  addEventListener(){}, removeEventListener(){},
  getComputedStyle(){ return {}; },
  devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

let app = null;
try {
  vm.runInNewContext(script, sandbox, { filename: 'field_mapper-inline.js' });
  app = sandbox;
} catch (e) {
  console.error('APP LOAD FAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
}

let passed = 0, failed = 0;
function ok(c, n){ if(c){ passed++; } else { failed++; console.error('  FAIL: ' + n); } }
function notContains(hay, needle, n){ ok(!String(hay || '').includes(needle), n); }

const toastEl = documentStub.getElementById('toast');
const btnSave = documentStub.getElementById('btnSave');
console.log('== DOM-stub end-to-end flow (loadFile -> saveFileCore) ==');

const t0 = toastEl.textContent;
ok(typeof app.loadFile === 'function' && typeof app.saveFileCore === 'function', 'app exposes loadFile/saveFileCore');
notContains(t0, 'self-test failed', 'startup self-test did not fail');
ok(btnSave.disabled === false, 'save button enabled after init');

const FE = '\u00FE', DC4 = '\u0014';
const rows = [
  FE + 'DOCID' + FE + DC4 + FE + 'NAME' + FE,
  FE + 'ABC0001' + FE + DC4 + FE + 'Alice' + FE,
  FE + 'ABC0002' + FE + DC4 + FE + 'Bob' + FE,
  FE + 'ABC0003' + FE + DC4 + FE + 'Carol' + FE
];
const fileBytes = new TextEncoder().encode(rows.join('\r\n') + '\r\n');
const feFile = new File([fileBytes], 'sample.dat', { type: 'application/octet-stream' });

await app.loadFile(feFile);
ok(!toastEl.textContent.includes('Could not process'), 'loadFile did not error');
ok(!toastEl.textContent.includes('No parseable header'), 'header parsed');

try { await app.saveFileCore(); }
catch (e) { console.error('  saveFileCore threw:', e && e.stack ? e.stack : e); }
const tSave = toastEl.textContent;
ok(tSave.includes('Saved') || tSave.includes('saved'), 'save reported success (got: ' + tSave + ')');
notContains(tSave, 'INCOMPLETE', 'save not flagged INCOMPLETE');
notContains(tSave, 'blocked', 'save not blocked');

// 5. Short-row file (override save) must save cleanly (v2.17: short = padded, long-only FAIL).
const FE2 = '\u00FE', DC2 = '\u0014';
const shortRows = [
  FE2+'DOCID'+FE2+DC2+FE2+'NAME'+FE2+DC2+FE2+'NOTE'+FE2,
  FE2+'ABC0001'+FE2+DC2+FE2+'Alice'+FE2+DC2+FE2+'n1'+FE2,
  FE2+'ABC0002'+FE2+DC2+FE2+'Bob'+FE2,
  FE2+'ABC0003'+FE2+DC2+FE2+'Carol'+FE2+DC2+FE2+'n3'+FE2
];
const shortBytes = new TextEncoder().encode(shortRows.join('\r\n') + '\r\n');
const shortFile = new File([shortBytes], 'short.dat', { type: 'application/octet-stream' });
await app.loadFile(shortFile);
ok(!toastEl.textContent.includes('Could not process'), 'short-row file loads without error');
documentStub.getElementById('reorderMismatchCbx').checked = true; // explicit override
await app.saveFileCore();
const tShort = toastEl.textContent;
ok(tShort.includes('Saved') || tShort.includes('saved'), 'short-row override save succeeds (got: ' + tShort + ')');
notContains(tShort, 'INCOMPLETE', 'short-row save not INCOMPLETE');
notContains(tShort, 'blocked', 'short-row save not blocked');
console.log('============================================================');
// 4. Drive the validator end-to-end: original vs an identical copy -> PASS.
const feFile2 = new File([fileBytes], 'sample2.dat', { type: 'application/octet-stream' });
const identitySel = documentStub.getElementById('valIdentityField');
identitySel.value = '0';
try {
  await app.valLoadSide('src', feFile, false);
  await app.valLoadSide('out', feFile2, false);
  await app.valAutoMap();
  identitySel.value = '0';
  await app.valRunValidate();
} catch (e) {
  console.error('  validator flow threw:', e && e.stack ? e.stack : e);
}
const tV = toastEl.textContent;
ok(tV.includes('PASS') || tV.includes('complete'), 'validator reported PASS (got: ' + tV + ')');
notContains(tV, 'FAIL', 'validator not FAIL');
notContains(tV, 'blocked', 'validator not blocked');
console.log('PASS ' + passed + '   FAIL ' + failed);
if (failed) process.exit(1);
console.log('DOM-stub flow checks passed.');
// __PART2__
