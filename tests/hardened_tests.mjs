import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=readFileSync(new URL('../field_mapper.html',import.meta.url),'utf8');
const script=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>'));
new vm.Script(script); // Parse the actual complete shipping script.
function section(a,b){const i=script.indexOf(a),j=script.indexOf(b,i+1);assert(i>=0&&j>i,a);return script.slice(i,j);}
const ctx=vm.createContext({console,TextEncoder,TextDecoder,Uint8Array,Uint16Array,Uint32Array,DataView,ArrayBuffer,File,Blob,setTimeout,clearTimeout});
vm.runInContext(section('/* __EDML_CORE_BEGIN__','/* __EDML_CORE_END__ */')+
  section('function sha256RotR(',"let auditText =")+
  section('async function hashFileBytes(', 'async function saveFileCore(')+
  section('async function valStreamPair(', 'async function valRunValidateCore(')+
  section('function createSink(', 'async function hashFileBytes(')+
  `\nlet lastSavedOutput=null; const setBusy=()=>{}; const window={};`,ctx);
const run=code=>vm.runInContext(code,ctx);
const api=run('({feSplit,feCompose,RecordStreamer,sniffMeta,buildFileIndex,scanFile,createStreamDecoder,textToBytes,metaBomBytes,createSha256,valStreamPair,hashFileBytes,savedHeaderCheck,createSink,state})');
const plain=v=>JSON.parse(JSON.stringify(v));
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
const compose=fields=>api.feCompose(fields);
const rows=[['DOCID','TEXT'],['D001','한글 😀 ® e\u0301'],['D002','  spaces \t 日本語 '],['D003','']];
function makeFile(text,kind='utf-8',bom=false){const meta={kind,hasBOM:bom,bomBytes:bom?(kind==='utf-8'?3:2):0};return new File([api.metaBomBytes(meta),api.textToBytes(meta,text)],'test.dat');}
const doc=(records=rows,eol='\r\n',trailing=true)=>records.map(compose).join(eol)+(trailing?eol:'');
async function descriptor(file){const meta=await api.sniffMeta(file);const idx=await api.buildFileIndex(file,meta,'fe');return {file,meta,fmt:'fe',headers:idx?.headerNames};}
async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('scan hung')),2500);})]);}finally{clearTimeout(timer);}}

await test('strict FE: unsafe delimiters/newlines/thorns and malformed records are rejected',()=>{
  assert.throws(()=>compose([]));
  for(const v of ['aþb','a\u0014b','a\rb','a\nb','\ud800','\udc00']) assert.throws(()=>compose([v]));
  for(const v of ['þaþþbþ','þaþ\u0014','þaþ\u0014b','a','þa\nbþ']) assert.throws(()=>api.feSplit(v));
});
await test('client field reuse cannot create a record larger than the reader safety limit',()=>{
  const value='x'.repeat(32*1024*1024);
  assert.throws(()=>compose([value,value]),/too large|exceeds|limit/i);
});
await test('5000 deterministic Unicode round trips and field order/empty preservation',()=>{
  let seed=19;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const pool=['A','한','😀','®','\t',' ','é','e\u0301','\uFEFF','日本',''];
  for(let i=0;i<5000;i++){const fields=Array.from({length:1+Math.floor(random()*6)},()=>Array.from({length:Math.floor(random()*12)},()=>pool[Math.floor(random()*pool.length)]).join(''));assert.deepEqual(plain(api.feSplit(compose(fields))),fields);}
});
await test('UTF-8/UTF-16 LE/BE × BOM × EOL × trailing EOL full byte/value round trip',async()=>{
  for(const kind of ['utf-8','utf-16le','utf-16be']) for(const bom of [false,true]) for(const eol of ['\r\n','\n','\r']) for(const trailing of [false,true]){
    const file=makeFile(doc(rows,eol,trailing),kind,bom),meta=await api.sniffMeta(file);
    assert.equal(meta.kind,kind);assert.equal(meta.hasBOM,bom);
    const index=await api.buildFileIndex(file,meta,'fe');assert.equal(index.dataRecords,3);assert.equal(index.mismatched,0);
    assert.equal(index.origHadTrailingEOL,trailing);
    assert.equal(index.byteHash,createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex'));
    const actual=[];await api.scanFile(file,meta,'fe',rec=>actual.push(plain(api.feSplit(rec))));assert.deepEqual(actual,rows);
    const rebuilt=makeFile(doc(actual,eol,trailing),kind,bom);assert.deepEqual(new Uint8Array(await rebuilt.arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
  }
});
await test('every character chunk boundary preserves CRLF and records',async()=>{
  const source=doc();for(let size=1;size<source.length;size++){
    const records=[];const stream=new api.RecordStreamer('fe',rec=>records.push(rec));
    for(let i=0;i<source.length;i+=size) await stream.push(source.slice(i,i+size));
    assert.equal(await stream.flush(),null);assert.deepEqual(records,rows.map(compose));
  }
});
await test('UTF-16 malformed surrogates reject during index/validation, never become replacement data',async()=>{
  for(const kind of ['utf-16le','utf-16be']) for(const unit of ['\ud800','\udc00']){
    const file=makeFile('þIDþ\r\nþ'+unit+'þ\r\n',kind,true);const meta=await api.sniffMeta(file);
    await assert.rejects(api.buildFileIndex(file,meta,'fe'),/Decode error/);
  }
  for(const kind of ['utf-16le','utf-16be']){
    const meta={kind};const bytes=api.textToBytes(meta,'😀');const decoder=api.createStreamDecoder(meta);
    let text='';for(const byte of bytes)text+=decoder.decode(Uint8Array.of(byte));text+=decoder.finish().text;assert.equal(text,'😀');
    const invalid=api.createStreamDecoder(meta);invalid.decode(api.textToBytes(meta,'\ud800'));assert.throws(()=>invalid.finish());
  }
});
await test('second BOM is content: unexpected leading U+FEFF cannot be silently removed',async()=>{
  for(const kind of ['utf-8','utf-16le','utf-16be']){
    const file=makeFile('\uFEFF'+doc(),kind,true),meta=await api.sniffMeta(file);
    await assert.rejects(api.buildFileIndex(file,meta,'fe'),/not fully enclosed/);
  }
});
await test('invalid UTF-8 rejects and odd UTF-16 tail is flagged',async()=>{
  const bad=new File([new Uint8Array([239,187,191]),new TextEncoder().encode(doc()),new Uint8Array([0xC3])],'bad.dat');
  await assert.rejects(api.buildFileIndex(bad,await api.sniffMeta(bad),'fe'),/Decode error/);
  const good=makeFile(doc(),'utf-16le',true);const odd=new File([good,Uint8Array.of(65)],'odd.dat');
  assert.equal((await api.buildFileIndex(odd,await api.sniffMeta(odd),'fe')).utf16TruncatedTail,true);
});
await test('short/long rows, mixed EOL, unclosed record are reported',async()=>{
  const file=makeFile(compose(rows[0])+'\r\n'+compose(['D1'])+'\n'+compose(['D2','x','extra'])+'\r\nþunclosed');
  const idx=await api.buildFileIndex(file,await api.sniffMeta(file),'fe');
  assert.equal(idx.shortRows,1);assert.equal(idx.longRows,1);assert.equal(idx.eolInfo.mixed,true);assert(idx.unclosedQualifier);
});
await test('SHA-256 matches independent Node crypto across padding/chunk boundaries',async()=>{
  for(const n of [0,1,55,56,63,64,65,119,120,127,128,129,1024,8*1024*1024+7]){
    const bytes=Uint8Array.from({length:n},(_,i)=>(i*17+19)%256);const hash=api.createSha256();
    for(let i=0;i<n;i+=7919)hash.update(bytes.subarray(i,i+7919));
    assert.equal(hash.hexDigest(),createHash('sha256').update(bytes).digest('hex'));
  }
  const file=makeFile(doc(),'utf-16be',true);assert.equal(await api.hashFileBytes(file),createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex'));
});
await test('saved header >1 MiB supported; missing, corrupt, unreadable headers fail closed',async()=>{
  const header=compose(['ID','x'.repeat(1024*1024+20)]);const file=makeFile(header+'\r\n'+compose(['D1','v']));const meta=await api.sniffMeta(file);
  assert.equal((await api.savedHeaderCheck(file,meta,'fe',header,2)).ok,true);
  assert.equal((await api.savedHeaderCheck(null,meta,'fe',header,2)).ok,false);
  assert.equal((await api.savedHeaderCheck(file,meta,'fe',header+'x',2)).ok,false);
});
await test('pair validator drains extra rows and keeps correct row numbers',async()=>{
  const a=await descriptor(makeFile(doc())),b=await descriptor(makeFile(doc(rows.slice(0,2))));const result=[];
  await bounded(api.valStreamPair({a,b},(x,y,i)=>{if(i!==null)result.push([x,y,i]);}));
  assert.deepEqual(result.map(x=>x[2]),[0,1,2]);assert.equal(result[1][1],null);assert.equal(result[2][1],null);
});
await test('pair validator rejects before header, truncated tail, changed headers, and consumer failure without hanging',async()=>{
  const good=await descriptor(makeFile(doc()));
  for(const a of [
    {...good,file:makeFile('')},
    {...good,file:{size:5,slice(){return {arrayBuffer:async()=>{throw Error('read failed');}};}}},
    {...good,file:makeFile('þIDþ\r\nþunclosed')},
    {...good,headers:['changed']}
  ]) await assert.rejects(bounded(api.valStreamPair({a,b:good},()=>{})));
  await assert.rejects(bounded(api.valStreamPair({a:good,b:good},()=>{throw Error('consumer cancelled');})),/consumer cancelled/);
});
await test('destination read error and existing nonempty file never open writable',async()=>{
  let opened=0;ctx.handle={getFile:async()=>{throw Error('permission denied');},createWritable:async()=>{opened++;}};
  run('window.showSaveFilePicker=async()=>handle');let sink=api.createSink();await sink.begin('out.dat');await assert.rejects(sink.open(),/permission denied/);assert.equal(opened,0);
  ctx.handle.getFile=async()=>new File(['existing'],'out.dat');sink=api.createSink();await sink.begin('out.dat');await assert.rejects(sink.open(),/existing-destination-blocked/);assert.equal(opened,0);
});
await test('stream sink commits exact bytes and detects same-size corruption via re-read hash',async()=>{
  for(const corrupt of [false,true]){
    let disk=new File([],'out.dat');const chunks=[];
    ctx.handle={getFile:async()=>disk,createWritable:async()=>({write:async b=>chunks.push(new Uint8Array(b)),abort:async()=>{},close:async()=>{let bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());if(corrupt)bytes[10]^=1;disk=new File([bytes],'out.dat');}})};
    const hash=api.createSha256(),sink=api.createSink(b=>hash.update(b));await sink.begin('out.dat');await sink.open();await sink.writeBytes(new TextEncoder().encode(doc()));await sink.finish('out.dat');
    assert.equal(sink.integrity().ok,true);assert.equal((await api.hashFileBytes(disk))===hash.hexDigest(),!corrupt);
  }
});
await test('changed BOM is rejected rather than hashing a reconstructed signature',async()=>{
  const file=makeFile(doc(),'utf-8',true),meta=await api.sniffMeta(file);
  const bytes=new Uint8Array(await file.arrayBuffer());bytes[0]=0;
  await assert.rejects(api.scanFile(new File([bytes],'changed.dat'),meta,'fe',()=>{}),/BOM changed/);
});
await test('save picker error never silently starts a Blob download',async()=>{
  run("window.showSaveFilePicker=async()=>{throw new Error('Permission denied');}");
  await assert.rejects(api.createSink().begin('out.dat'),/Save picker failed/);
});
await test('column-count cap blocks array allocation before it happens',async()=>{
  const FE='\u00FE',DC4='\u0014',LIMIT=run('MAX_FIELD_COUNT');
  const fields=new Array(LIMIT).fill('A');
  const okRecord=api.feCompose(fields);
  assert.equal(api.feSplit(okRecord).length,LIMIT);
  const wide=fields.concat(['A']);
  assert.throws(()=>api.feCompose(wide),/safety limit|column/);
  const raw=wide.map(f=>FE+f+FE).join(DC4);
  assert.throws(()=>api.feSplit(raw),/safety limit|column/);
});
await test('bounded width histogram keeps exact totals under width diversity',async()=>{
  const LIMIT=run('MAX_TRACKED_WIDTHS');
  const records=[['H1','H2'],['ok','row']];
  for(let w=3;w<3+LIMIT;w++)records.push(Array.from({length:w},(_,j)=>'r'+w+'_'+j));
  for(let i=0;i<5;i++)records.push(Array.from({length:3+LIMIT+100},(_,j)=>'o'+i+'_'+j));
  const text=records.map(compose).join('\r\n')+'\r\n';
  const idx=await api.buildFileIndex(makeFile(text),await api.sniffMeta(makeFile(text)),'fe');
  assert.equal(idx.dataRecords,records.length-1);
  assert.equal(idx.mismatched,LIMIT+5);
  assert.equal(idx.shortRows,0);
  assert.equal(idx.longRows,LIMIT+5);
  assert.equal(idx.rowFieldCounts.counts.size,LIMIT);
  assert.equal(idx.untrackedWidthRows,5);
  assert.equal(idx.rowFieldCounts.get(2),1);
  assert.equal(idx.rowFieldCounts.get(3),1);
});
await test('T1 exact is whitespace/case exact; folding lives only in T2',async()=>{
  const exact=run("findHeaderMatch('Control Number', ['Control Number'], 1)");
  assert(exact && exact.tier===1);
  const t1ws=run("findHeaderMatch(' Control Number ', ['Control Number'], 1)");
  assert.equal(t1ws,null);
  const t2ws=run("findHeaderMatch(' Control Number ', ['Control Number'], 2)");
  assert(t2ws && t2ws.tier===2);
  const t1case=run("findHeaderMatch('CONTROL NUMBER', ['Control Number'], 1)");
  assert.equal(t1case,null);
  const t2case=run("findHeaderMatch('CONTROL NUMBER', ['Control Number'], 2)");
  assert(t2case && t2case.tier===2);
});
console.log(`\n${passed} test groups passed (including 5000 property cases).`);
