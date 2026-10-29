"""Import literal melee/armor/anatomy wiki tables; Python stdlib only.

Usage: python scripts/import_melee_wiki.py --cache .qa/wiki
Existing cached pages are reused. Delete a cache page to explicitly refresh it.
The public site uses the committed snapshot and makes no wiki requests.
"""
import argparse
import datetime
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WEAPONS = "Alpha_thrumbo_horn Axe Beer Breach_axe Club Elephant_tusk Eltex_staff Gladius Ikwa Jade_knife Knife Longsword Mace Mastodon_tusk Monosword Persona_monosword Persona_plasmasword Persona_zeushammer Plasmasword Spear Thrumbo_horn Warhammer Wood Zeushammer".split()
GEAR = {
    "Flak_vest": (None, ["Torso", "Neck"], 2),
    "Simple_helmet": ("Steel", ["UpperHead"], 3),
    "Marine_armor": (None, ["Torso", "Neck", "Shoulders", "Arms", "Legs"], 3),
    "Marine_helmet": (None, ["FullHead"], 3),
    "Button-down_shirt": ("Cloth", ["Torso", "Neck", "Shoulders", "Arms"], 1),
    "Pants": ("Cloth", ["Legs"], 1),
}
MECHANICS = "Weapons Weapon_Guide Apparel Human Damage_types Injury Pain Health Consciousness Moving Melee_Hit_Chance Melee_Dodge_Chance Melee_Damage_Factor".split()


class Element:
    def __init__(self, tag="root", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def all(self, tag):
        result = []
        for c in self.children:
            if isinstance(c, Element):
                if c.tag == tag:
                    result.append(c)
                result.extend(c.all(tag))
        return result

    def text(self):
        if self.tag in ("sup", "script", "style"):
            return ""
        if self.tag == "br":
            return "\n"
        return "".join(c.text() if isinstance(c, Element) else c for c in self.children)


class Parser(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Element()
        self.stack = [self.root]
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        e = Element(tag, attrs)
        self.stack[-1].children.append(e)
        if tag not in "area base br col embed hr img input link meta param source track wbr".split():
            self.stack.append(e)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def clean(e):
    return re.sub(r"\s+", " ", e.text()).strip()


def cells(row):
    return [c for c in row.children if isinstance(c, Element) and c.tag in ("td", "th")]


def number(text):
    match = re.fullmatch(r"([\d.,]+)(%|s)?", text.strip())
    if not match:
        raise ValueError(f"Unrecognized number: {text!r}")
    return float(match[1].replace(",", "")) / (100 if match[2] == "%" else 1)


def grid(table):
    """Expand rowspan/colspan, including the two-level source headers."""
    result, occupied = [], {}
    for y, row in enumerate(table.all("tr")):
        line, x = [], 0
        for c in cells(row):
            while (y, x) in occupied:
                x += 1
            for yy in range(y, y + int(c.attrs.get("rowspan", 1))):
                for xx in range(x, x + int(c.attrs.get("colspan", 1))):
                    occupied[yy, xx] = c
            x += int(c.attrs.get("colspan", 1))
        width = max(xx for yy, xx in occupied if yy == y) + 1
        line = [occupied.get((y, xx)) for xx in range(width)]
        result.append(line)
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cache", type=Path, default=ROOT / ".qa/wiki")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    pages, sources = {}, []
    for page in dict.fromkeys(WEAPONS + list(GEAR) + MECHANICS):
        file = args.cache / (page + ".html")
        url = "https://rimworldwiki.com/wiki/" + page
        if not file.exists():
            request = urllib.request.Request(url, headers={"User-Agent": "RimWorldFieldNotes/1.0 (personal reference; wiki table snapshot)"})
            with urllib.request.urlopen(request, timeout=45) as response:
                file.write_bytes(response.read())
        html = file.read_text(encoding="utf-8")
        pages[page] = Parser(html).root
        rev = re.search(r'"wgRevisionId"\s*:\s*(\d+)', html)
        if not rev:
            raise ValueError(f"Missing revision on {page}")
        sources.append({"title": page.replace("_", " "), "url": url, "revision": int(rev[1]), "snapshotUrl": url + "?oldid=" + rev[1]})

    variants = []
    for page in WEAPONS:
        doc = pages[page]
        tables = [t for t in doc.all("table") if t.all("tr") and "Human:" in clean(t.all("tr")[0])]
        if len(tables) != 1:
            raise ValueError(f"Expected one attack table on {page}; got {len(tables)}")
        table = tables[0]
        rows = grid(table)
        header = [clean(c) for c in rows[1]]
        q = header.index("Quality") if "Quality" in header else None
        m = header.index("Material") if "Material" in header else None
        groups, offset = [], 0
        for c in cells(table.all("tr")[0]):
            label = clean(c)
            match = re.fullmatch(r"(.+) \((Blunt|Poke|Stab|Cut|Scratch|Demolish)\)", label)
            if match and not label.startswith("Human:"):
                groups.append((offset, match[1], match[2]))
            offset += int(c.attrs.get("colspan", 1))
        if not groups:
            raise ValueError(f"Missing attacks: {page}")
        dlc_match = re.search(r"content added by (Royalty|Odyssey|Anomaly)", clean(doc))
        for row in rows[2:]:
            values = [clean(c) if c else "" for c in row]
            quality = values[q] if q is not None else "Fixed"
            material = values[m] if m is not None else "None"
            if quality not in ("Fixed", "Awful", "Poor", "Normal", "Good", "Excellent", "Masterwork", "Legendary"):
                raise ValueError(f"Unexpected quality: {page} {quality}")
            attacks = []
            for index, label, kind in groups:
                attacks.append({"name": label, "type": kind, "damage": number(values[index]), "cooldown": number(values[index + 1]), "ap": number(values[index + 2]), "fixedAP": (page in ("Monosword", "Persona_monosword") and kind in ("Cut", "Stab")) or (page == "Spear" and kind == "Stab")})
            required = [dlc_match[1]] if dlc_match else []
            material_dlc = {"Bioferrite": "Anomaly", "Obsidian": "Odyssey", "Vacstone blocks": "Odyssey"}.get(material)
            if material_dlc and material_dlc not in required:
                required.append(material_dlc)
            variants.append({"id": f"{page}|{material}|{quality}", "weapon": page.replace("_", " "), "material": material, "quality": quality, "dlc": required, "attacks": attacks, "wikiDps": number(values[header.index("DPS")]), "source": "https://rimworldwiki.com/wiki/" + page, "special": "plasma" if "plasmasword" in page.lower() else "emp" if "zeushammer" in page.lower() else "improvised" if page in ("Beer", "Wood") else ""})

    body_table = next(t for t in pages["Human"].all("table") if t.all("tr") and clean(t.all("tr")[0]).startswith("Part Name"))
    body = []
    for row in body_table.all("tr")[1:]:
        c = cells(row)
        if len(c) != 10:
            raise ValueError("Changed body-part table")
        name = clean(c[0])
        if name == "Waist":
            continue  # conceptual, zero coverage, no physical HP in the model
        body.append({"name": name, "hp": number(clean(c[1])), "count": int(clean(c[2])), "coverage": number(clean(c[4])), "parent": clean(c[5]).replace("N/A", ""), "internal": any("Check" in im.attrs.get("alt", "") for im in c[6].all("img")), "groups": [s.strip() for s in c[7].text().splitlines() if s.strip()], "indestructible": "Cannot be destroyed" in clean(c[9])})
    armor = {}
    for page, (material, groups, layer) in GEAR.items():
        table = next(t for t in pages[page].all("table") if t.all("tr") and "Sharp" in clean(t.all("tr")[0]) and "Market Value" in clean(t.all("tr")[0]))
        rows = grid(table)
        row = next(r for r in rows[2:] if clean(r[0]) == "Normal" and (not material or clean(r[1]) == material))
        offset = 2 if material else 1
        armor[page] = {"name": (material + " " if material else "") + page.replace("_", " "), "sharp": number(clean(row[offset])), "blunt": number(clean(row[offset + 1])), "heat": number(clean(row[offset + 2])), "groups": groups, "layer": layer}

    if len({v["id"] for v in variants}) != len(variants) or len(body) < 35:
        raise ValueError("Duplicate weapon variants or incomplete anatomy")
    if any(a["damage"] <= 0 or a["cooldown"] <= 0 for v in variants for a in v["attacks"]):
        raise ValueError("Invalid weapon stat")
    data = {"schema": 1, "snapshotDate": datetime.date.today().isoformat(), "attribution": "RimWorld Wiki contributors, CC BY-SA 3.0", "sources": sources, "variants": variants, "body": body, "armor": armor}
    out = ROOT / "site/assets/melee-data.js"
    out.write_text("// Wiki table snapshot. Regenerate with scripts/import_melee_wiki.py.\n(function (root) {\n  const data = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n  if (typeof module === 'object' && module.exports) module.exports = data;\n  else root.RIMWORLD_MELEE_DATA = data;\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n", encoding="utf-8")
    print(f"Imported {len(variants)} variants, {len(body)} body-part types, {len(armor)} armor pieces, {len(sources)} cited revisions.")
    print(json.dumps(armor, indent=2))


if __name__ == "__main__":
    main()
