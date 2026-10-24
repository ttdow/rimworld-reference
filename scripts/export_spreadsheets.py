"""Export the two source workbooks to the dependency-free reference website.

Read-only access to the originals. Requires openpyxl for extraction only.
Run from any directory: python scripts/export_spreadsheets.py
"""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"

SCHEMAS = {
    "apparel": {
        "file": "Apparel.xlsx",
        "name": "Apparel",
        "nameKey": "name",
        "categoryKey": "layer",
        "columns": [
            ("layer", "Layer", "text"),
            ("name", "Name", "text"),
            ("sharp", "Armor - Sharp", "number"),
            ("blunt", "Armor - Blunt", "number"),
            ("heatArmor", "Armor - Heat", "number"),
            ("hp", "HP (Hit Points)", "number"),
            ("coverage", "Coverage", "text"),
            ("coldMultiplier", "Cold Insulation Multiplier", "multiplier"),
            ("coldBase", "Cold Insulation Base (°C)", "temperature"),
            ("heatMultiplier", "Heat Insulation Multiplier", "multiplier"),
            ("heatBase", "Heat Insulation Base (°C)", "temperature"),
            ("special", "Special Properties", "text"),
            ("research", "Research requirement", "text"),
            ("work", "Work to Make (ticks)", "number"),
            ("material1Amount", "Material 1 Amount", "number"),
            ("material1Type", "Material 1 Type", "text"),
            ("material2Amount", "Material 2 Amount", "number"),
            ("material2Type", "Material 2 Type", "text"),
            ("marketValue", "Base Market Value", "number"),
            ("valueWork", "Value/Work", "number"),
            ("valueMaterial", "Value/Material", "number"),
        ],
    },
    "textiles": {
        "file": "Textiles.xlsx",
        "name": "Textiles",
        "nameKey": "name",
        "categoryKey": "category",
        "columns": [
            ("name", "Textile", "text"),
            ("category", "Stuff category", "text"),
            ("beauty", "Beauty multiplier", "multiplier"),
            ("hp", "Max HP multiplier", "multiplier"),
            ("flammability", "Flammability multiplier", "multiplier"),
            ("sharp", "Armor sharp multiplier", "multiplier"),
            ("blunt", "Armor blunt multiplier", "multiplier"),
            ("heatArmor", "Armor heat multiplier", "multiplier"),
            ("coldBonus", "Cold insulation material bonus (C)", "temperature"),
            ("heatBonus", "Heat insulation material bonus (C)", "temperature"),
            ("marketValue", "Market value (silver/unit)", "number"),
        ],
    },
}


def export() -> None:
    datasets = {}
    for key, schema in SCHEMAS.items():
        source = ROOT / schema["file"]
        workbook = openpyxl.load_workbook(source, data_only=True)
        formulas = openpyxl.load_workbook(source, data_only=False)
        try:
            if len(workbook.worksheets) != 1:
                raise ValueError(f"{source.name}: expected one sheet; review new sheets before exporting.")
            sheet = workbook.worksheets[0]
            headers = [column[1] for column in schema["columns"]]
            values = list(sheet.iter_rows(values_only=True))
            if list(values[0]) != headers:
                raise ValueError(f"{source.name}: column headers changed; update SCHEMAS before exporting.")

            # Formula values must be cached by the spreadsheet application.
            for row in formulas.worksheets[0]:
                for cell in row:
                    if cell.data_type == "f" and sheet[cell.coordinate].value is None:
                        raise ValueError(f"{source.name}!{cell.coordinate}: missing formula result.")

            rows = []
            for source_row, cells in enumerate(values[1:], start=2):
                if all(value is None for value in cells):
                    continue
                record = {column[0]: value for column, value in zip(schema["columns"], cells, strict=True)}
                if not record[schema["nameKey"]]:
                    raise ValueError(f"{source.name}: row {source_row} has no item name.")
                record["sourceRow"] = source_row
                rows.append(record)
            names = [row[schema["nameKey"]] for row in rows]
            if len(names) != len(set(names)):
                raise ValueError(f"{source.name}: duplicate item names need review.")
            datasets[key] = {
                "name": schema["name"],
                "nameKey": schema["nameKey"],
                "categoryKey": schema["categoryKey"],
                "source": {
                    "file": source.name,
                    "sheet": sheet.title,
                    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                },
                "columns": [{"key": col[0], "label": col[1], "type": col[2]} for col in schema["columns"]],
                "rows": rows,
            }
        finally:
            workbook.close()
            formulas.close()

    assets = SITE / "assets"
    sources = SITE / "sources"
    assets.mkdir(parents=True, exist_ok=True)
    sources.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"datasets": datasets}, ensure_ascii=True, indent=2, allow_nan=False)
    (assets / "data.js").write_text("// Generated by scripts/export_spreadsheets.py.\nwindow.RIMWORLD_DATA = " + payload + ";\n", encoding="utf-8")
    for schema in SCHEMAS.values():
        shutil.copyfile(ROOT / schema["file"], sources / schema["file"])
    print("Exported " + ", ".join(f"{len(data['rows'])} {key} rows / {len(data['columns'])} columns" for key, data in datasets.items()))


if __name__ == "__main__":
    export()
