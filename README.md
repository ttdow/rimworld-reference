# RimWorld Field Notes

A static GitHub Pages reference for apparel, textiles, egg-laying animals, and milk-producing animals, populated from the original workbooks and CSVs in this directory.

Live site: https://ttdow.github.io/rimworld-reference/

The page has searchable, sortable tables, category filters, focused column views, every original column, item details, a light/dark theme, and CSV export of the filtered records. Searches cover every field, including fields outside the selected column view. Empty source cells remain empty; no material or quality calculations are added. The egg-laying animals table also filters by game content and male requirements. The milk-producing animals table filters by pack-animal and caravan-mount roles, with focused views for milk/feed and climate/caravans. Both retain the supplied production and feed-efficiency estimates with clickable wiki sources.

Link directly to the animals tables with `https://ttdow.github.io/rimworld-reference/#eggs` or `https://ttdow.github.io/rimworld-reference/#milk`.

## Melee lab

The separate [Melee lab](https://ttdow.github.io/rimworld-reference/melee.html) compares 567 wiki weapon/material/quality combinations and an unarmed human benchmark by median time to incapacitation. It offers editable pawn settings, unarmored/flak/marine target presets, seeded Monte Carlo trials, confidence intervals, timeout-aware percentiles, cumulative distributions, attack mixes, trial logs and CSV/JSON exports. Existing reference tables and their source data are independent of the simulator.

This is an **experimental wiki-based injury model**, with no local game-data dependency. Bleeding, ongoing fire, retaliation and several special effects are omitted; capacity and hit propagation details include documented approximations. Read [the full specification and limitations](docs/melee-model.md) before interpreting rankings as gameplay predictions. Wiki-derived data and adapted descriptions are attributed to RimWorld Wiki contributors under CC BY-SA 3.0, with permanent revision links in the page.

The simulator works from static files, using a Web Worker on HTTP(S) and a yielding fallback when workers are unavailable. Run the engine checks with `node --test tests/melee-engine.test.cjs`. Optional DOM integration tests require jsdom 30.1.3: `node tests/melee-ui.cjs [path/to/jsdom]`. GitHub Pages runs syntax and engine checks before deployment. To update the committed wiki snapshot, use `python scripts/import_melee_wiki.py --cache .qa/wiki`; a fresh cache downloads fresh pages. Review changes and retest before publishing.

## Preview

Open `site/index.html` directly in a browser. The page needs no build, package installation, or network connection. Alternatively, run this from the project directory and open `http://127.0.0.1:8765`:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory site
```

## Update the data

Update `Apparel.xlsx`, `Textiles.xlsx`, `rimworld_egg_laying_animals_comparison.csv`, or `rimworld_milk_producing_animals_comparison.csv`, then run:

```powershell
python -m pip install openpyxl
python scripts/export_spreadsheets.py
```

The exporter reads the original files without modifying them. It generates `site/assets/data.js` and copies the source files to `site/sources/` for download. All original values and columns are retained; item details identify the file, sheet (for workbooks), and row. Changed headers, extra sheets, duplicate names, and formulas without saved results stop the export for review. CSV numeric fields are typed for sorting, and percentage values already expressed in percent are displayed without rescaling. Source estimates are not recalculated from rounded inputs. The exporter requires Python 3.10 or later.

Commit the updated source files and generated site files together. GitHub deploys the committed static files; it does not need spreadsheet libraries.

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
