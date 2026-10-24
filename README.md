# RimWorld Field Notes

A static GitHub Pages reference for apparel and textiles, populated from the original workbooks in this directory.

The page has searchable, sortable tables, category filters, focused column views, every original column, item details, a light/dark theme, and CSV export of the filtered records. Searches cover every field, including fields outside the selected column view. Empty spreadsheet cells remain empty; no material or quality calculations are added.

## Preview

Open `site/index.html` directly in a browser. The page needs no build, package installation, or network connection. Alternatively, run this from the project directory and open `http://127.0.0.1:8765`:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory site
```

## Update the data

Update `Apparel.xlsx` or `Textiles.xlsx`, then run:

```powershell
python -m pip install openpyxl
python scripts/export_spreadsheets.py
```

The exporter reads the original files without modifying them. It generates `site/assets/data.js` and copies the source workbooks to `site/sources/` for download. All original values and columns are retained; item details identify the workbook, sheet, and row. Changed headers, extra sheets, duplicate names, and formulas without saved results stop the export for review. The exporter requires Python 3.10 or later.

Commit the updated workbooks and generated site files together. GitHub deploys the committed static files; it does not need spreadsheet libraries.

## Publish as a separate GitHub Pages project

Use a **new repository**, such as `rimworld-reference`. Do not reuse an existing Pages repository or create/replace the account's `USERNAME.github.io` repository. This project includes no custom-domain `CNAME` file and requires no changes to existing sites or DNS.

1. Authenticate GitHub CLI with `gh auth login --hostname github.com`.
2. Initialize this directory as a new repository on branch `main` and commit its files.
3. Create and push a new repository, checking that the chosen name is unused:

   ```powershell
   gh repo create rimworld-reference --public --source . --remote origin --push
   ```

4. In the **new repository only**, open **Settings → Pages** and choose **GitHub Actions** as the source.
5. Run the **Deploy RimWorld reference to GitHub Pages** workflow. Future pushes to `main` deploy automatically.

The normal project URL is `https://USERNAME.github.io/rimworld-reference/`. If the account's main Pages site uses a custom domain, GitHub may serve project sites beneath that domain instead. Asset links are relative so the page works beneath a project path in either case.

Only `site/` is uploaded for deployment. The workflow targets the repository containing it; it does not edit any other repository or existing Pages configuration.
