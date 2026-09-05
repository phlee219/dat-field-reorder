# DAT Field Reorder — FE/DC4 (v2.10.0)

Browser-only tool for eDiscovery professionals to **reorder/remove fields** and build **client header maps** for FE/DC4 load-file `.dat` documents, then **re-read the saved file** and validate it against the original.

Everything runs **locally** — no upload, no server, no network. Works best in **Chrome / Edge** (streaming file save).

---

## Supported input

| Aspect | Support |
|---|---|
| Layout | **FE/DC4** — fields `þ…þ`, separated by `0x14 (DC4)` (primary) · **legacy no-DC4** layout `þaþþbþ` accepted automatically (per record) |
| Encoding | UTF-8 (±BOM) · UTF-16 LE/BE (±BOM). CP1252 and other formats are **blocked by design** |
| EOL | CRLF / LF / CR — record separators and a trailing EOL are preserved |
| Values | Empty fields, embedded newlines (multiline), `þ` escaped as `þþ`, any Unicode |

Other dialects (Concordance `^|^`, CSV, TSV, Pipe) and CP1252 are intentionally not accepted.

---

## Modes

1. **Reorder / Remove** — pick a source, reorder or drop columns, live-preview the first rows, save.
2. **Client Header Map** — paste delivery headers (vertical list or 2-column map), link each to a source field (1:1 or 1:N), save; unmapped headers are written empty only with an explicit override.
3. **Validator** — after a save, press **🧪 Validate saved output** (or drop any two files) to re-read the **actual file** and compare.

---

## Data-integrity guarantees

**Before any byte is written**
- Structural risks block the save: raw `0x14` inside a value, **unpaired UTF-16 surrogates**, truncated UTF-16 tail, unclosed text qualifier, blank headers, rows whose column count differs from the header (override = explicit consent).
- Overwriting an existing file requires consent; saving over the loaded source is blocked.

**While writing**
- Streaming (constant memory). If a write is interrupted, the UI warns that the destination may be partially replaced, and closing the tab during a save is guarded.

**After saving**
- Post-save self-check: the on-disk size must equal the bytes written — a mismatch marks the file unusable and disables 1-Click validation.
- Optional SHA-256 audit report (source bytes + every written byte) is saved/downloadable with a timestamped name.

**1-Click re-read validator (the real check)**
- Re-reads the actual saved file and compares against the original:
  - record/schema reconciliation + **per-cell** parsed comparison (only EOL normalization is auto-accepted),
  - **identity row-linkage** — the chosen identity values must appear in exactly the same order/values (catches dropped, duplicated, reordered rows),
  - **encoding / BOM / EOL style-and-count** equality (single-style sources),
  - **disk == saved-bytes** SHA-256 chain when validating the file just saved,
  - re-read SHA-256 of both files is printed in the report.
- The 1-Click context is invalidated whenever a **new source is loaded or the file is re-parsed**, so an output can never be "validated" against the wrong original.

---

## Explicit limits / operator responsibilities

- Validation pairs rows **by position**; it is not a general row-permutation comparator.
- Identity **uniqueness / gap QC** (e.g. duplicate or missing Control Numbers) remains the operator's responsibility — the tool compares identity *sequences*, it does not enforce uniqueness.
- Legacy no-DC4 layout has **no escape for a literal `þ` inside a value** (parsed as a field boundary).
- Manual validation of two files that intentionally differ in encoding/BOM/EOL **fails by design** (byte-level metadata is strict).
- This is integrity tooling, not a forensic chain-of-custody/provenance system; companion-file completeness is out of scope.

---

## Files

```
field_mapper.html   ← the entire app (single file, no dependencies)
README.md           ← this guide
.nojekyll           ← static-hosting marker
```

Host it anywhere static (file://, GitHub Pages, intranet). No backend required.
