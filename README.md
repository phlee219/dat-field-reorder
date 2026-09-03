# DAT Field Reorder

A browser-based tool for eDiscovery professionals to **reorder and remove fields** in load-file (`.dat`, `.txt`, `.csv`, `.opt`, `.load`) documents.

**Supports automatic format detection:**

| Format | Example |
|---|---|
| `þ` (0xFE) | `þBEGBATESþþCONTROLþ` |
| **Concordance `^ | ^`** | `^Priv^|^Control Number^|^Author^|^...` |
| CSV | `"Priv","Control Number"` |
| Tab-delimited | `Priv\tControl Number` |
| Pipe | `Priv\|Control Number` |

Encoding is also auto-detected: **UTF-8 (±BOM) / UTF-16 LE / UTF-16 BE / Windows-1252**. The saved file keeps the same format and encoding as the source.

- Works completely **in your browser** — no upload, no server, no network requests
- Your actual case data never leaves the computer
- Deploy to **GitHub Pages** once, then share one URL with colleagues

---

## 🔒 Privacy / Security

**All processing happens locally in the browser.**

- The `.dat` file is read with `FileReader` and handled entirely in memory.
- **No file is uploaded, transmitted, or stored anywhere.**
- Refresh the page and the data is gone.

Because the app is a static page with no backend, hosting it on a public GitHub Pages address is safe — only the tool code is served, never your data.

---

## 🧰 Features

| Feature | Description |
|---|---|
| Load | Drag & drop or click to open a load file |
| Format auto-detection | `þ (0xFE)`, **Concordance `^|^`**, CSV, Tab, Pipe — with manual override |
| Auto-detection | Encoding (UTF-8 ±BOM, UTF-16 LE/BE, Windows-1252 fallback), line endings (CRLF / LF / CR), header row (first row) |
| Robust parser | Handles multi-line field values (embedded newlines) correctly |
| **Reorder fields** | Drag rows, or use Top / ▲ Up / ▼ Down / Bottom buttons |
| **Remove fields** | Press 🗑 on any row — the field is dropped from the header **and** from every data row |
| Restore | Removed fields reappear in the left list; click to add them back. **↺ Reset** restores the original order |
| Search | Quickly find source fields by name |
| Live preview | Shows the new header order plus the first 4 data records |
| Save | Downloads a new `.dat` (`_reordered.dat`) preserving the original encoding, BOM, delimiter (`þ 0xFE`) and line endings |
| Data integrity | Original file is never modified; extra/unknown columns in data rows are preserved |

---

## 🚀 Quick Start (User)

1. Open the deployed URL in Chrome / Edge.
2. Drop a `.dat` file onto the dashed area.
3. In the right panel **New Field Order**:
   - Drag rows to reorder, or select a row and use `Top / ▲ / ▼ / Bottom`.
   - Press **🗑** to remove fields you do not need.
   - Removed fields are listed in the yellow warning box and excluded from the output.
4. Check the **preview**, then press **⬇ Download New .dat File**.

The original file is never changed — you always get a new file named `…_reordered.dat`.

---

## 📦 Deploy to GitHub Pages (one-time)

### Option A — Web interface

1. Go to [github.com](https://github.com) → **New repository**.
   - Repository name: e.g. `dat-field-reorder`
   - Visibility: **Public** (free Pages hosting)
2. Click **Add file → Upload files**, then upload these 3 files:
   ```
   index.html
   README.md
   .nojekyll
   ```
3. Click **Commit changes**.
4. Open the repository **Settings → Pages**.
   - **Build and deployment** → Source: **Deploy from a branch**
   - Branch: `main`, folder: `/ (root)` → **Save**
5. Wait 1–2 minutes, then open:
   ```
   https://<your-github-username>.github.io/dat-field-reorder/
   ```
6. Share that URL with anyone who needs the tool.

### Option B — Command line

```bash
git init
git add index.html README.md .nojekyll
git commit -m "DAT Field Reorder"
git branch -M main
git remote add origin https://github.com/<username>/dat-field-reorder.git
git push -u origin main
```
Then follow step 4 (Settings → Pages) above.

### Updating after changes

After editing files:

```bash
git add .
git commit -m "updates"
git push
```

GitHub Pages rebuilds automatically (usually within 1–2 minutes).

---

## 🧪 Testing with your own file

Use one of your real `.dat` files:

1. Open the tool URL.
2. Load the file — the summary should show your encoding, e.g. `UTF-16 (LE) · BOM present · CRLF (Windows)`, and the correct number of columns/records.
3. Move `Custodian` to the top, then remove something like `Temp_Scrubbing`.
4. Press **Download New .dat File**.
5. Reload the downloaded file in the tool — verify the new header order and that the removed column is gone from every row.

---

## ℹ️ Supported Formats & Encodings

| Dialect | Quote | Separator | Record example |
|---|---|---|---|
| `þ` 0xFE | `þ` | none (adjacent pairs) | `þvalue1þþvalue2þ` |
| Concordance | `^` | `\|` | `^Priv^\|^Control Number^\|^Author^` |
| CSV | `"` (`""` escape) | `,` | `"Priv","Control Number"` |
| Tab | `"` optional | Tab | `Priv\tControl Number` |
| Plain pipe | none | `\|` | `Priv\|Control Number\|Author` |

Detection order: 0xFE → `^|^` → CSV → Tab → Pipe. The header row drives detection; use the **Override** dropdown if a file is misidentified.

- **Encoding**: UTF-8 (±BOM), UTF-16 LE/BE (±BOM), Windows-1252 fallback — auto-detected and preserved on save
- **Row terminator**: CRLF, LF, CR (preserved)
- Header: first row = field names; multiline values inside quoted fields are handled
- Column mismatch: missing → empty, extra → preserved at the end
- Manual override: Dropdown + ↺ Re-parse button lets you force a different format

---

## � Files

```
index.html   ← the entire app (single file, no dependencies)
README.md    ← this guide
.nojekyll    ← tells GitHub Pages not to process the repo with Jekyll
```

---

## �🛠 Troubleshooting

- **“No parseable records found”** → Make sure the first row is the header and values are wrapped in `þ…þ`.
- **Row count doesn’t match header** → The tool fills missing values and preserves extras. See the 🧵 Parsing Notes section.
- **Odd number of `þ` at the end** → The source file may be truncated; double-check the output.

---

*All processing is local — nothing you load is ever uploaded or transmitted over the network.*