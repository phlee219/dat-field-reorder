// Synthetic load-file fixtures (eDiscovery Data-Integrity TDD).
// Each entry is one intentionally representative/malformed case. Feed a fixture
// to tests/run_core_tests.mjs - the app logic must catch EVERY malformed case
// (zero silent failure) and round-trip every well-formed case losslessly.
const utf8 = (s) => new TextEncoder().encode(s);

const FE = '\u00FE';
const DC4 = '\u0014';

export const fixtures = {

  // ---- Well-formed (must round-trip losslessly) ---------------------------
  // FE/DC4, header + one data row whose last field holds multi-line extracted
  // text containing LF and CRLF. Embedded EOLs must NOT split the record.
  feMultiline: {
    desc: 'FE/DC4 multi-line text field (embedded LF + CRLF)',
    bytes: utf8(
      FE + 'DOCID' + FE + DC4 + FE + 'CUSTODIAN' + FE + DC4 + FE + 'EXTRACT' + FE + '\r\n' +
      FE + 'ABC0001' + FE + DC4 + FE + 'Smith, John' + FE + DC4 + FE + 'line1\nline2\r\nline3' + FE + '\r\n'
    ),
    expectRecords: 2,
    expectHeaderCols: 3,
    expectLastValue: 'line1\nline2\r\nline3'
  },
  feLegacyNoDc4: {
    desc: 'Legacy no-DC4 FE (consecutive FE pairs)',
    bytes: utf8(FE + 'A' + FE + FE + 'B' + FE + '\r\n' + FE + 'x' + FE + FE + 'y' + FE + '\r\n'),
    expectRecords: 2,
    expectHeaderCols: 2
  },
  feEscapedThorn: {
    desc: 'Modern FE/DC4 field containing an escaped literal thorn (FE FE)',
    bytes: utf8(
      FE + 'DOCID' + FE + DC4 + FE + 'RAW' + FE + '\r\n' +
      FE + 'D1' + FE + DC4 + FE + 'A' + FE + FE + 'B' + FE + '\r\n'
    ),
    expectRecords: 2,
    expectHeaderCols: 2,
    expectValue: 'A' + FE + 'B'      // second data column decodes to a literal thorn
  },

  // ---- Intentionally MALFORMED (every case must be caught/blocked) --------
  feUnbalancedThorn: {
    desc: 'Unbalanced text qualifier (odd FE count)',
    bytes: utf8(FE + 'DOCID' + FE + DC4 + FE + 'NAME' + FE + '\r\n' + FE + 'A' + FE + DC4 + 'unclosed-no-close' + FE + '\r\n'),
    malformed: true,
    catchIn: 'unclosed-qualifier'      // RecordStreamer.flush must report it
  },
  feRawDc4InValue: {
    desc: 'Raw DC4 (0x14) inside a field value (no escape exists)',
    bytes: utf8(FE + 'DOCID' + FE + '\r\n' + FE + 'A' + DC4 + 'B' + FE + '\r\n'),
    malformed: true,
    catchIn: 'dc4-in-field'
  },
  feBatesZeroPadDrop: {
    desc: 'Bates zero-padding truncation risk fixture (ABC0009 -> ABC0010 must keep width)',
    bytes: utf8(FE + 'Bates_Begin' + FE + '\r\n' + FE + 'ABC0009' + FE + '\r\n' + FE + 'ABC0010' + FE + '\r\n'),
    expectRecords: 3,
    expectZeroPadKept: ['ABC0009', 'ABC0010']
  },
  utf16LeWithBomMultiline: {
    desc: 'UTF-16 LE (+BOM) multi-line text field',
    bytes: (()=>{
      const t = FE + 'DOCID' + FE + DC4 + FE + 'TXT' + FE + '\r\n' +
               FE + 'D1' + FE + DC4 + FE + 'body\nhere' + FE + '\r\n';
      const be = new Uint8Array([0xFF,0xFE]);
      const b = new Uint8Array(t.length*2);
      for(let i=0;i<t.length;i++){ const c=t.charCodeAt(i); b[i*2]=c&0xFF; b[i*2+1]=(c>>8)&0xFF; }
      const out = new Uint8Array(be.length + b.length);
      out.set(be); out.set(b, be.length);
      return out;
    })(),
    expectRecords: 2,
    encoding: 'utf-16le'
  }
};

export { FE, DC4, utf8 };
