// tests/run_core_tests.mjs
// Node harness for the pure FE/DC4 + encoding core extracted from
// field_mapper.html between __EDML_CORE_BEGIN__ / __EDML_CORE_END__.
// Run:  node tests/run_core_tests.mjs      (Node >= 18, no dependencies)
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixtures, FE, DC4, utf8 } from './fixtures.mjs';

const html = readFileSync(new URL('../field_mapper.html', import.meta.url), 'utf8');
const BEGIN = '/* __EDML_CORE_BEGIN__';
const END = '/* __EDML_CORE_END__ */';
const i0 = html.indexOf(BEGIN);
const i1 = html.indexOf(END);
if (i0 < 0 || i1 < 0 || i1 <= i0) { console.error('Core markers not found'); process.exit(2); }
// Keep the whole marker comment block so extraction never starts mid-comment.
const coreSource = html.slice(i0, i1);
const ws0 = html.indexOf('<script>') + '<script>'.length;
const ws1 = html.indexOf('</script>');
const wholeScript = ws0 >= 8 && ws1 > ws0 ? html.slice(ws0, ws1) : '';

const EXPOSE = [
  'FE','FE_DELIM','FORMATS','sanitizeScalarValue','feSplit','feCompose','ccSplit','ccCompose',
  'csvSplit','csvCompose','tabSplit','tabCompose','pipeSplit','pipeCompose','delimitedSplit',
  'RecordStreamer','CP1252_MAP','decoderNameFor','createStreamDecoder','decoderFor','DECODER_SUPPORT',
  'encodeCp1252Chunk','textToBytes','metaBomBytes','eolInfoFromCounts','detectEol',
  'looksLikeFeRecord','detectFormat','firstMeaningfulLine','firstLineOf','countChar',
  'sniffMeta','scanFile','buildFileIndex','foldHeader','findHeaderMatch','headerNameSim',
  'FIELD_ALIAS_GROUPS','dataRowStreamer','isBlankPhysicalRecord','MAX_RECORD_UNITS'
];
const api = {};
const sandbox = { __out: api, console, TextEncoder, TextDecoder, Uint8Array,
  Uint16Array, DataView, ArrayBuffer, Set, Map, Math, Number, String, Object, Array,
  RegExp, JSON, Promise };
const tail = EXPOSE.map((n) => `__out.${n}=${n};`).join('');
vm.runInNewContext(coreSource + '\n;' + tail, sandbox, { filename: 'core.js' });

let passed = 0, failed = 0; const fails = [];
function ok(c, n){ if(c){passed++;} else {failed++; fails.push(n); console.error('  FAIL: '+n);} }
function eq(a,e,n){ const A=JSON.stringify(a),B=JSON.stringify(e);
  if(A===B){passed++;} else {failed++; fails.push(n); console.error(`  FAIL: ${n}\n    actual   ${A}\n    expected ${B}`);} }
function throws(fn,n){ try{fn(); failed++; fails.push(n); console.error('  FAIL (no throw): '+n);}catch(e){passed++;} }

const { feSplit, feCompose, ccSplit, ccCompose, csvSplit, sanitizeScalarValue,
  encodeCp1252Chunk, textToBytes, metaBomBytes, detectEol, decoderFor, DECODER_SUPPORT,
  looksLikeFeRecord, detectFormat, sniffMeta, buildFileIndex, RecordStreamer,
  findHeaderMatch, headerNameSim, FIELD_ALIAS_GROUPS, dataRowStreamer, scanFile } = api;

async function parseText(fmtKey, text){
  const recs = [];
  const s = new RecordStreamer(fmtKey, (rec) => { recs.push(rec); });
  for (let i = 0; i < text.length; i += 7) await s.push(text.slice(i, i + 7));
  const broken = await s.flush();
  return { recs, broken };
}

console.log('== EDML pure-core data-integrity tests ==');

console.log('\n[A-2] format detection (FE must never be handed to a wrong splitter)');
ok(looksLikeFeRecord(FE+'A'+FE), 'looksLikeFeRecord single column');
ok(looksLikeFeRecord(FE+'A'+FE+DC4+FE+'B'+FE), 'looksLikeFeRecord modern multi-column');
ok(looksLikeFeRecord(FE+'A'+FE+FE+'B'+FE), 'looksLikeFeRecord legacy no-DC4');
ok(!looksLikeFeRecord('A,B'), 'looksLikeFeRecord rejects plain CSV');
ok(!looksLikeFeRecord('^A^|^B^'), 'looksLikeFeRecord rejects Concordance');
eq(detectFormat('\u00FE' + 'DOCID' + '\u00FE' + '\u0014' + '\u00FE' + 'NAME' + '\u00FE'), 'fe', 'detect modern FE');
eq(detectFormat('\u00FE' + 'DOCID' + '\u00FE' + '\u00FE' + 'NAME' + '\u00FE'), 'fe', 'detect legacy FE');
eq(detectFormat('\u00FE' + 'SMITH, JOHN' + '\u00FE' + '\u0014' + '\u00FE' + 'NOTE' + '\u00FE'), 'fe', 'FE header containing comma stays FE (A-2)');
eq(detectFormat('"a","b"'), 'csv', 'detect CSV');
eq(detectFormat('^a^|^b^'), 'cc', 'detect Concordance');
eq(detectFormat('a\tb'), 'tsv', 'detect TSV');
eq(detectFormat('a|b'), 'pipe', 'detect Pipe');

console.log('\n[splitters] round-trip & malformed detection');
const mline = 'line1\nline2\r\nline3';
eq(feSplit(feCompose(['DOCID','TXT','line1\nline2\r\nline3'])), ['DOCID','TXT',mline], 'fe round-trip embedded LF+CRLF');
eq(feSplit(feCompose(['DOCID','RAW'])), ['DOCID','RAW'], 'plain FE round-trip');
throws(() => feCompose(['has' + DC4 + 'raw']), 'feCompose throws on raw DC4 in value (no silent loss)');
throws(() => feSplit('\u00FEopen-unbalanced-no-close\u00FE\u0014'), 'feSplit throws on unbalanced qualifier');
eq(feSplit('\u00FEa\u00FE\u00FEb\u00FE'), ['a','b'], 'legacy FE two fields');
// A literal thorn in a value only round-trips in the MODERN DC4 layout via the
// FE FE escape; the legacy no-DC4 layout has no escape (documented). Assert the
// modern case through a DC4-bearing two-column record.
eq(feSplit(feCompose(['X','A' + FE + 'B'])), ['X','A' + FE + 'B'], 'escaped literal thorn round-trips (modern FE/DC4)');
eq(ccSplit(ccCompose(['a','b'])), ['a','b'], 'Concordance round-trip');
eq(csvSplit(api.csvCompose(['a','b"c'])), ['a','b"c'], 'CSV quote-escape round-trip');

console.log('\n[streaming] chunk boundaries & unclosed qualifier');
{
  const body = '\u00FE' + 'DOCID' + '\u00FE' + '\u0014' + '\u00FE' + 'TXT' + '\u00FE' + '\r\n' +
               '\u00FE' + 'D1' + '\u00FE' + '\u0014' + '\u00FE' + mline + '\u00FE' + '\r\n';
  const r = await parseText('fe', body);
  eq(r.recs.length, 2, 'multiline text emitted as exactly 2 records');
  eq(feSplit(r.recs[1])[1], mline, 'multiline text preserved across chunk boundary');
}
{
  const unbalanced = '\u00FE' + 'DOCID' + '\u00FE' + '\u0014' + '\u00FE' + 'NAME' + '\u00FE' + '\r\n' +
                     '\u00FE' + 'A' + '\u00FE' + '\u0014' + 'never-closed' + '\u00FE';
  const r = await parseText('fe', unbalanced);
  ok(r.broken && r.broken.record > 0, 'unclosed qualifier reported by flush (fail-closed)');
}
console.log('\n[surrogates] fail-closed');
throws(() => sanitizeScalarValue('a\uD83D'), 'lone high surrogate throws');
throws(() => sanitizeScalarValue('\uDC00z'), 'lone low surrogate throws');
eq(sanitizeScalarValue('a\uD83D\uDE00b'), 'a\uD83D\uDE00b', 'valid surrogate PAIR allowed');

console.log('\n[cp1252] loss is counted');
{
  const stats = { cpLost: 0, cpLostFirst: null };
  const bytes = encodeCp1252Chunk('\u00E9\u2603', stats); // é representable; snowman not
  eq(Array.from(bytes), [0xE9, 0x3F], 'representable kept, unrepresentable -> single ?');
  ok(stats.cpLost === 1, 'cp1252 loss counter recorded the substitution');
}

console.log('\n[encoding] utf-16 + BOM helpers');
{
  const le = textToBytes({ kind: 'utf-16le' }, 'A' + '\u00FE' + 'B');
  eq(Array.from(le), [0x41, 0x00, 0xFE, 0x00, 0x42, 0x00], 'utf-16le encoding byte order');
}
eq(Array.from(metaBomBytes({ kind: 'utf-8', hasBOM:true })), [0xEF,0xBB,0xBF], 'UTF-8 BOM bytes');
eq(Array.from(metaBomBytes({ kind: 'utf-16le', hasBOM:true })), [0xFF,0xFE], 'UTF-16LE BOM bytes');
eq(Array.from(metaBomBytes({ kind: 'utf-16be', hasBOM:true })), [0xFE,0xFF], 'UTF-16BE BOM bytes');
eq(Array.from(metaBomBytes({ kind: 'utf-16le', hasBOM:false })), [], 'no BOM -> empty');

console.log('\n[EOL] detection');
eq(detectEol('a\r\nb\r\n').label, 'CRLF (Windows)', 'detect CRLF');
eq(detectEol('a\nb').label, 'LF (Unix)', 'detect LF');
eq(detectEol('a\rb').label, 'CR (Mac)', 'detect CR');
ok(detectEol('a\r\nb\nc').mixed, 'mixed EOL flagged');

console.log('\n[fixtures] every well-formed case must round-trip, every malformed case must be caught');
for (const [name, fx] of Object.entries(fixtures)) {
  const text = new TextDecoder(fx.encoding === 'utf-16le' ? 'utf-16le' : 'utf-8').decode(fx.bytes);
  if (fx.malformed) {
    const r = await parseText('fe', text);
    let caught = !!(r.broken && r.broken.record > 0);
    if (!caught && fx.catchIn !== 'unclosed-qualifier') {
      for (let k = 0; k < r.recs.length; k++) {
        try { feSplit(r.recs[k]); } catch (e) { caught = true; break; }
      }
    }
    ok(caught, 'malformed fixture caught: ' + name);
  } else {
    const r = await parseText('fe', text);
    ok(r.recs.length === fx.expectRecords, 'fixture record count ' + name + ' = ' + fx.expectRecords + ' (got ' + r.recs.length + ')');
    if (fx.expectHeaderCols != null) eq(feSplit(r.recs[0]).length, fx.expectHeaderCols, 'fixture header cols ' + name);
    if (name === 'feMultiline') eq(feSplit(r.recs[1])[2], fx.expectLastValue, 'multiline value preserved');
    if (name === 'feEscapedThorn') eq(feSplit(r.recs[1])[1], fx.expectValue, 'escaped literal thorn preserved');
    if (name === 'feBatesZeroPadDrop') {
      eq(feSplit(r.recs[1])[0], 'ABC0009', 'bates seq row 1');
      eq(feSplit(r.recs[2])[0], 'ABC0010', 'bates seq row 2 (width preserved)');
      ok(feSplit(r.recs[2])[0].length === 7, 'zero-padding width kept on ABC0010');
    }
  }
}

const mk = (text) => new File([utf8(text)], 'fixture.dat');
console.log('\n[integration] full path (File -> sniff -> index) + A-1 decoder guard');
{
  // R2: an embedded LF inside a text-field value must NOT mark the file "mixed".
  const body = '\u00FE' + 'DOCID' + '\u00FE' + '\u0014' + '\u00FE' + 'TXT' + '\u00FE' + '\r\n' +
               '\u00FE' + 'D1' + '\u00FE' + '\u0014' + '\u00FE' + 'a\nb' + '\u00FE' + '\r\n';
  const f2 = mk(body);
  const meta = await sniffMeta(f2);
  eq(meta.kind, 'utf-8', 'sniff identifies utf-8');
  eq(detectFormat(meta.sampleText), 'fe', 'detect FE through sniff sample');
  const idx = await buildFileIndex(f2, meta, 'fe', () => {});
  ok(idx !== null, 'index built');
  eq(idx.dataRecords, 1, '1 data record');
  ok(idx.eolInfo && idx.eolInfo.mixed === false && idx.eolInfo.eol === '\r\n',
     'embedded LF inside value is ignored; separators are single CRLF (R2)');
}
{
  // R3: a stray blank line before the header must not break FE detection/index.
  const f3 = mk('\r\n' + '\u00FE' + 'DOCID' + '\u00FE' + '\u0014' + '\u00FE' + 'N' + '\u00FE' + '\r\n' +
                '\u00FE' + '1' + '\u00FE' + '\u0014' + '\u00FE' + 'x' + '\u00FE' + '\r\n');
  const meta = await sniffMeta(f3);
  eq(detectFormat(meta.sampleText), 'fe', 'leading blank line still detected FE (R3)');
  const idx = await buildFileIndex(f3, meta, 'fe', () => {});
  ok(idx !== null && idx.dataRecords === 1, 'leading blank line skipped; index built (R3)');
}
{
  // A-1: decoderFor must throw fail-closed when a decoder is unavailable.
  const prev = DECODER_SUPPORT['utf-16be'];
  DECODER_SUPPORT['utf-16be'] = false;
  throws(() => decoderFor('utf-16be'), 'unsupported decoder throws (A-1 fail-closed)');
  DECODER_SUPPORT['utf-16be'] = prev;
}

console.log('\n[3-tier auto-match] monotonic + alias + ambiguity');
{
  const srcs = ['DOCID','Custodian','BegBates','Control Number','Email_From','Text'];
  // tier 1 exact only
  ok(findHeaderMatch('DOCID', srcs, 1) && findHeaderMatch('DOCID', srcs, 1).idx === 0, 'T1 exact maps DOCID');
  ok(findHeaderMatch('docid', srcs, 1) === null, 'T1 does not map different case');
  // tier 2 adds normalized-equality
  const t2 = findHeaderMatch('docid', srcs, 2);
  ok(t2 && t2.idx === 0 && t2.tier === 2, 'T2 maps docid -> DOCID (normalized)');
  // tier 3 alias: Bates_Begin is a synonym of BEGDOC
  const alias = findHeaderMatch('Bates Begin', ['Custodian','BEGDOC','Email_From'], 3);
  ok(alias && alias.idx === 1 && alias.tier === 3, 'T3 alias maps Bates Begin -> BEGDOC');
  const ctrl = findHeaderMatch('Control No.', ['ControlNumber','Text','X'], 3);
  ok(ctrl && ctrl.idx === 0 && ctrl.tier === 3, 'T3 alias maps Control No. -> ControlNumber');
  // monotonic count: tier1 < tier2 for 'docid'; tier2 0 < tier3 1 for 'Control No.'
  const count = (maxTier, name) => srcs.some((s)=>s!==name) && (findHeaderMatch(name, srcs, maxTier) ? 1 : 0);
  ok(count(1, 'docid') === 0 && count(2, 'docid') === 1, 'tier 1 < tier 2 mapping count (docid)');
  ok(count(2, 'Control No.') === 0 && count(3, 'Control No.') === 1, 'tier 2 < tier 3 mapping count (Control No.)');
  // ambiguity never guessed: two near-identical source names for the same alias
  const amb = findHeaderMatch('controlno', ['ControlNumber','CONTROLNUMBER','Z'], 3);
  ok(amb === null, 'ambiguous duplicate source names are NOT auto-mapped');
  // guard against trivial fuzzy on tiny names
  ok(findHeaderMatch('XY', ['DOCID','XYZ','AB'], 3) === null, 'tiny/weak names are not fuzzy-mapped');
}
console.log('\n[header alignment] leading blank lines handled identically everywhere (v2.15)');
{
  const body = '\r\n\r\n' + '\u00FE' + 'DOCID' + '\u00FE' + '\u0014' + '\u00FE' + 'NAME' + '\u00FE' + '\r\n' +
               '\u00FE' + 'D1' + '\u00FE' + '\u0014' + '\u00FE' + 'Alice' + '\u00FE' + '\r\n' +
               '\u00FE' + 'D2' + '\u00FE' + '\u0014' + '\u00FE' + 'Bob' + '\u00FE' + '\r\n';
  const f = new File([utf8(body)], 'lead.dat');
  const meta = await sniffMeta(f);
  eq(detectFormat(meta.sampleText), 'fe', 'leading blanks still detected FE');
  const idx = await buildFileIndex(f, meta, 'fe', () => {});
  ok(idx && idx.dataRecords === 2, 'index reports 2 data records (blanks skipped, header=DOCID/NAME)');
  const rows = [];
  const walk = dataRowStreamer(async (rec) => { rows.push(rec); });
  await scanFile(f, meta, 'fe', walk, () => {});
  eq(rows.length, 2, 'dataRowStreamer yields exactly 2 data rows (same as index)');
  eq(feSplit(rows[0]).join('|'), 'D1|Alice', 'first data row is real data, NOT the header');
}
console.log('\n[DOM-free helpers outside core markers] identityShape / valExpectedTransformation / normKey / unsafeClientHeader');
{
  // Extract a top-level function declaration by source (string/comment aware).
  function extractFn(name){
    const s = wholeScript.indexOf('function ' + name + '(');
    if(s < 0) throw new Error('fn not found: ' + name);
    let i = wholeScript.indexOf('{', s), depth = 0, n = wholeScript.length;
    for(; i < n; i++){
      const c = wholeScript[i];
      if(c === "'" || c === '"' || c === '`'){
        const q = c; i++;
        while(i < n && wholeScript[i] !== q){ if(wholeScript[i] === '\\') i++; i++; }
        continue;
      }
      if(c === '/' && wholeScript[i+1] === '/'){ while(i < n && wholeScript[i] !== '\n') i++; continue; }
      if(c === '/' && wholeScript[i+1] === '*'){ i += 2; while(i < n && !(wholeScript[i] === '*' && wholeScript[i+1] === '/')) i++; i++; continue; }
      if(c === '{') depth++;
      else if(c === '}'){ depth--; if(depth === 0) return wholeScript.slice(s, i+1); }
    }
    throw new Error('unbalanced: ' + name);
  }
  function bindFn(deps, src, retName){
    const keys = Object.keys(deps);
    const fnName = retName || /function\s+(\w+)/.exec(src)[1];
    const F = new Function(...keys, src + '; return ' + fnName + ';');
    return F(...keys.map(k => deps[k]));
  }
  const identityShape = bindFn({}, extractFn('identityShape'));
  const valExpectedTransformation = bindFn({}, extractFn('valExpectedTransformation'));
  const normKey = bindFn({}, extractFn('normKey'));
  const uniqueNormalizedIndex = bindFn({}, extractFn('normKey') + '\n' + extractFn('uniqueNormalizedIndex'), 'uniqueNormalizedIndex');
  const unsafeClientHeader = bindFn({}, extractFn('unsafeClientHeader'));

  // identityShape (B-6)
  const ish = identityShape('ABC0007');
  ok(ish && ish.num === 7 && ish.width === 4, 'identityShape parses prefix+width+num');
  ok(identityShape('hello') === null, 'identityShape ignores non-numeric tokens');
  ok(identityShape('') === null, 'identityShape ignores empty');
  // valExpectedTransformation: only EOL normalization is an expected rule
  ok(!!valExpectedTransformation('a\nb', 'a\r\nb'), 'EOL normalization is the single expected rule');
  ok(valExpectedTransformation('a\nb', 'a\nc') === null, 'value change is NOT auto-approved');
  // normKey
  eq(normKey('  Custodian_1! '), 'custodian1', 'normKey strips case/spaces/punct');
  eq(normKey('한글-테스트 2'), '한글테스트2', 'normKey keeps Hangul + digits');
  // uniqueNormalizedIndex
  eq(uniqueNormalizedIndex(['DOCID','Custodian'], 'CUSTODIAN'), 1, 'unique normalized lookup');
  ok(uniqueNormalizedIndex(['A','A'], 'a') === null, 'ambiguous duplicate fold -> null');
  ok(uniqueNormalizedIndex(['x'], 'nope') === null, 'no match -> null');
  // unsafeClientHeader
  ok(unsafeClientHeader('fe', 'ok name') === null, 'plain FE header allowed');
  ok(unsafeClientHeader('fe', 'a\u0014b') !== null, 'raw DC4 in FE header blocked');
  ok(unsafeClientHeader('pipe', 'a|b') !== null, 'pipe delimiter header blocked');
  ok(unsafeClientHeader('tsv', 'a\tb') !== null, 'tab delimiter header blocked');
  ok(unsafeClientHeader('cc', '^|^') !== null, 'Concordance separator token blocked');
  ok(unsafeClientHeader('fe', 'line\nbreak') !== null, 'line break header blocked');
}

console.log('\n[property] randomized feCompose<->feSplit round-trip (modern DC4)');
{
  const { FE, FE_DELIM, feSplit, feCompose } = api;
  let seed = 20260905;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pool = ['a','Z','0',' ','\n','\r','\t','-','.','é','가', FE];
  const value = () => {
    let s = '';
    const n = 1 + Math.floor(rnd() * 10);
    for(let i = 0; i < n; i++) s += pool[Math.floor(rnd() * pool.length)];
    return s;
  };
  let bad = 0;
  const ROUNDS = 5000;
  for(let k = 0; k < ROUNDS; k++){
    const nf = 2 + Math.floor(rnd() * 5);
    const arr = [];
    for(let j = 0; j < nf; j++) arr.push(value());
    try {
      const out = feSplit(feCompose(arr));
      if(JSON.stringify(out) !== JSON.stringify(arr)){
        bad++;
        if(bad < 4) console.error('  MISMATCH', JSON.stringify(arr), '->', JSON.stringify(out));
      }
    } catch(e){ bad++; if(bad < 4) console.error('  unexpected throw', JSON.stringify(arr), e.message); }
  }
  ok(bad === 0, `randomized FE round-trip lossless (${ROUNDS} rounds, ${bad} mismatches)`);
  let dcbad = 0;
  for(let k = 0; k < 1000; k++){
    const arr = [value(), value()];
    if(rnd() < 0.5) arr[0] += FE_DELIM;      // raw DC4 must be blocked
    let threw = false;
    try { feCompose(arr); } catch(e){ threw = true; }
    if(arr[0].indexOf(FE_DELIM) >= 0){ if(!threw) dcbad++; }
    else if(threw){ dcbad++; }
  }
  ok(dcbad === 0, `raw DC4 always blocked, clean values never blocked (${dcbad} failures)`);
}

console.log('\n[property] streaming chunk boundaries == whole-string parse');
{
  const { FE, FE_DELIM, feCompose, RecordStreamer } = api;
  let seed = 424242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pool = ['a','Z','0',' ','x','\n','\r','é','가', FE];
  const value = () => { let s=''; const n=1+Math.floor(rnd()*8); for(let i=0;i<n;i++) s += pool[Math.floor(rnd()*pool.length)]; return s; };
  async function parse(text, slice){
    const recs=[]; const s = new RecordStreamer('fe', r => recs.push(r));
    for(let i=0;i<text.length;i+=slice) await s.push(text.slice(i,i+slice));
    const broken = await s.flush(); return JSON.stringify({ recs, broken });
  }
  let bad = 0; const R = 600;
  for(let k=0;k<R;k++){
    const rows=[]; const nr=1+Math.floor(rnd()*4);
    for(let r=0;r<nr;r++){ const nf=1+Math.floor(rnd()*4); const f=[]; for(let j=0;j<nf;j++) f.push(value()); rows.push(feCompose(f)); }
    const text = rows.join('\r\n') + (rnd()<0.5?'\r\n':'');
    const a = await parse(text, text.length||1);
    const b = await parse(text, 1+Math.floor(rnd()*10));
    if(a!==b) bad++;
  }
  ok(bad===0, `chunked == whole streaming parse over ${R} random documents (${bad} mismatches)`);
}

console.log('\n[property] tier auto-match monotonic + range invariants');
{
  const { findHeaderMatch } = api;
  let seed = 777;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const words = ['DOCID','BegDoc','Bates_Begin','Custodian','Control Number','ControlNo','EndBates','FamilyID','AttachID','Email_From','Text','Native_Link','Prod_Vol','MD5','FileName','x','y','ab','cd'];
  let mv=0, rv=0; const R = 1200;
  for(let k=0;k<R;k++){
    const n=1+Math.floor(rnd()*10); const srcs=[]; const seen=new Set();
    for(let j=0;j<n;j++){ let w=words[Math.floor(rnd()*words.length)]; if(rnd()<0.3) w+=Math.floor(rnd()*9); if(seen.has(w)) w+='_'+Math.floor(rnd()*99); seen.add(w); srcs.push(w); }
    const t = words[Math.floor(rnd()*words.length)] + (rnd()<0.3 ? Math.floor(rnd()*9) : '');
    const c = [1,2,3].map(tier => findHeaderMatch(t, srcs, tier) ? 1 : 0);
    if(!(c[0]<=c[1] && c[1]<=c[2])) mv++;
    for(let ti=1;ti<=3;ti++){ const r=findHeaderMatch(t,srcs,ti); if(r && (r.idx<0||r.idx>=srcs.length||r.tier<1||r.tier>3)) rv++; }
  }
  ok(mv===0, `tier monotonic T1<=T2<=T3 over ${R} rounds (${mv} violations)`);
  ok(rv===0, `findHeaderMatch index/tier range over ${R} rounds (${rv} violations)`);
}

console.log('\n[short-row] buildFileIndex distinguishes short vs long (v2.17 structural basis)');
{
  const hdr = FE+'DOCID'+FE+DC4+FE+'NAME'+FE+DC4+FE+'NOTE'+FE;
  const shortFile = new File([utf8(
    hdr+'\r\n'+
    FE+'1'+FE+DC4+FE+'Alice'+FE+DC4+FE+'n1'+FE+'\r\n'+
    FE+'2'+FE+DC4+FE+'Bob'+FE+'\r\n'+
    FE+'3'+FE+DC4+FE+'Carol'+FE+DC4+FE+'n3'+FE+'\r\n'
  )], 'short.dat');
  const meta = await sniffMeta(shortFile);
  const idx = await buildFileIndex(shortFile, meta, 'fe', ()=>{});
  ok(idx !== null, 'short-row file indexes');
  ok(idx.shortRows === 1, 'one short row detected');
  ok(idx.longRows === 0, 'no long rows (structural FAIL must be long-only)');
  ok(idx.dataRecords === 3, '3 data records');
}
console.log('\n============================================================');
console.log('PASS ' + passed + '   FAIL ' + failed);
if (failed) { console.error('FAILED: ' + fails.join(' | ')); process.exit(1); }
console.log('All pure-core data-integrity checks passed.');
