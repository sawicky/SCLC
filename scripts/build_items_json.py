#!/usr/bin/env python3
"""build_items_json.py - convert SC localization TSV into items.json for sclc."""
import argparse, csv, json, re, sys
from collections import defaultdict

CATEGORY_FROM_PREFIX = {
    "SHLD": ("Ship Components", "Shield Generators"),
    "POWR": ("Ship Components", "Power Plants"),
    "COOL": ("Ship Components", "Coolers"),
    "QDRV": ("Ship Components", "Quantum Drives"),
    "QRDV": ("Ship Components", "Quantum Drives"),
    "RADR": ("Ship Components", "Radars"),
    "JUMP": ("Ship Components", "Jump Modules"),
    "SCAN": ("Ship Components", "Scanners"),
    "PING": ("Ship Components", "Pings"),
    "MISL": ("Ship Weapons", "Missiles"),
    "GMISL": ("Ship Weapons", "Ground Missiles"),
    "BOMB": ("Ship Weapons", "Bombs"),
    "MINING": ("Ship Weapons", "Mining Lasers"),
}

MANUFACTURER_FROM_PREFIX = {
    "ACAS": "ACES", "ACOM": "Acom", "AEGS": "Aegis Dynamics",
    "AMRS": "Amon & Reese Co.", "APAR": "Apocalypse Arms",
    "ARGO": "ARGO Astronautics", "ASAD": "Aopoa", "BANU": "Banu",
    "BASL": "Basilisk", "BEHR": "Behring", "ESPR": "Esperia",
    "FSKI": "FireStorm Kinetics", "GATS": "Gallenson Tactical Systems",
    "GLSN": "Gallenson Tactical Systems",
    "GODI": "Gorgon Defender Industries", "GRIN": "Greycat Industrial",
    "GRNP": "GNP", "HRST": "Hurston Dynamics",
    "IDRIS": "Aegis Dynamics", "JOKR": "Joker Engineering",
    "JSPN": "J-Span", "JUST": "Juno Starwerk", "KASR": "Kastak Arms",
    "KBAR": "Kastak Arms", "KLWE": "Klaus & Werner",
    "KRIG": "Kruger Intergalactic", "KRON": "Kronos",
    "LPLT": "Lightning Power Ltd", "MXOX": "Maxox",
    "NAVE": "Nav-Aerospace", "NOVP": "Novarian",
    "PRAR": "Preacher Armament", "RSI": "RSI", "SASU": "Sakura Sun",
    "TALN": "Talon Weapon Systems", "THCN": "Thermyte Concern",
    "TOAG": "Terra Optical", "TYDT": "Tyler Design & Tech",
    "VNCL": "Vanduul", "WCPR": "Wen/Cassel Propulsion",
    "WETK": "Wei-Tek", "WLOP": "WillsOp", "YORM": "Yorm",
}

WEAPON_TYPE_FROM_SEGMENT = {
    "LaserCannon": ("Ship Weapons", "Laser Cannons"),
    "LaserRepeater": ("Ship Weapons", "Laser Repeaters"),
    "LaserGatling": ("Ship Weapons", "Laser Gatlings"),
    "LaserScattergun": ("Ship Weapons", "Laser Scatterguns"),
    "LaserScatterGun": ("Ship Weapons", "Laser Scatterguns"),
    "LaserBeam": ("Ship Weapons", "Laser Beams"),
    "BallisticCannon": ("Ship Weapons", "Ballistic Cannons"),
    "BallisticRepeater": ("Ship Weapons", "Ballistic Repeaters"),
    "BallisticGatling": ("Ship Weapons", "Ballistic Gatlings"),
    "BallisticScatterGun": ("Ship Weapons", "Ballistic Scatterguns"),
    "BallisticScattergun": ("Ship Weapons", "Ballistic Scatterguns"),
    "DistortionCannon": ("Ship Weapons", "Distortion Cannons"),
    "DistortionRepeater": ("Ship Weapons", "Distortion Repeaters"),
    "DistortionScatterGun": ("Ship Weapons", "Distortion Scatterguns"),
    "DistortionScattergun": ("Ship Weapons", "Distortion Scatterguns"),
    "NeutronCannon": ("Ship Weapons", "Neutron Cannons"),
    "NeutronRepeater": ("Ship Weapons", "Neutron Repeaters"),
    "TachyonCannon": ("Ship Weapons", "Tachyon Cannons"),
    "MassDriver": ("Ship Weapons", "Mass Drivers"),
    "PlasmaCannon": ("Ship Weapons", "Plasma Cannons"),
    "PlasmaScattergun": ("Ship Weapons", "Plasma Scatterguns"),
    "TractorBeam": ("Ship Weapons", "Tractor Beams"),
    "TowingBeam": ("Ship Weapons", "Tractor Beams"),
    "Tiburon": ("Ship Weapons", "Laser Beams"),
    "PowerPlant": ("Ship Components", "Power Plants"),
    "Rocket": ("Ship Weapons", "Rocket Pods"),
}

KEY_FRAGMENT_FROM_SEGMENT = {
    "RPOD": ("Ship Weapons", "Rocket Pods"),
    "EMP": ("Ship Weapons", "EMP Generators"),
}

ITEM_TYPE_TO_CATEGORY = {
    "shield generator": ("Ship Components", "Shield Generators"),
    "power plant": ("Ship Components", "Power Plants"),
    "cooler": ("Ship Components", "Coolers"),
    "quantum drive": ("Ship Components", "Quantum Drives"),
    "jump module": ("Ship Components", "Jump Modules"),
    "radar": ("Ship Components", "Radars"),
    "scanner": ("Ship Components", "Scanners"),
    "laser cannon": ("Ship Weapons", "Laser Cannons"),
    "laser repeater": ("Ship Weapons", "Laser Repeaters"),
    "laser gatling": ("Ship Weapons", "Laser Gatlings"),
    "laser scattergun": ("Ship Weapons", "Laser Scatterguns"),
    "laser scatter gun": ("Ship Weapons", "Laser Scatterguns"),
    "laser turret": ("Ship Weapons", "Laser Cannons"),
    "laser beam": ("Ship Weapons", "Laser Beams"),
    "ballistic cannon": ("Ship Weapons", "Ballistic Cannons"),
    "ballistic cannon turret": ("Ship Weapons", "Ballistic Cannons"),
    "ballistic repeater": ("Ship Weapons", "Ballistic Repeaters"),
    "ballistic gatling": ("Ship Weapons", "Ballistic Gatlings"),
    "ballistic gatling (x2)": ("Ship Weapons", "Ballistic Gatlings"),
    "ballistic gatling gun": ("Ship Weapons", "Ballistic Gatlings"),
    "ballistic gatling turret": ("Ship Weapons", "Ballistic Gatlings"),
    "ballistic scattergun": ("Ship Weapons", "Ballistic Scatterguns"),
    "ballistic scatter gun": ("Ship Weapons", "Ballistic Scatterguns"),
    "distortion cannon": ("Ship Weapons", "Distortion Cannons"),
    "distortion repeater": ("Ship Weapons", "Distortion Repeaters"),
    "distortion scattergun": ("Ship Weapons", "Distortion Scatterguns"),
    "distortion scatter gun": ("Ship Weapons", "Distortion Scatterguns"),
    "tachyon cannon": ("Ship Weapons", "Tachyon Cannons"),
    "mass driver": ("Ship Weapons", "Mass Drivers"),
    "mass driver cannon": ("Ship Weapons", "Mass Drivers"),
    "plasma cannon": ("Ship Weapons", "Plasma Cannons"),
    "plasma canon": ("Ship Weapons", "Plasma Cannons"),
    "plasma scattergun": ("Ship Weapons", "Plasma Scatterguns"),
    "neutron cannon": ("Ship Weapons", "Neutron Cannons"),
    "neutron repeater": ("Ship Weapons", "Neutron Repeaters"),
    "burst generator": ("Ship Weapons", "EMP Generators"),
    "emp generator": ("Ship Weapons", "EMP Generators"),
    "tractor beam": ("Ship Weapons", "Tractor Beams"),
    "towing beam": ("Ship Weapons", "Tractor Beams"),
    "bomb": ("Ship Weapons", "Bombs"),
    "explosive bomb": ("Ship Weapons", "Bombs"),
    "emp bomb": ("Ship Weapons", "Bombs"),
    "rocket pod": ("Ship Weapons", "Rocket Pods"),
    "rocket": ("Ship Weapons", "Rocket Pods"),
    "missile": ("Ship Weapons", "Missiles"),
    "strike missile": ("Ship Weapons", "Missiles"),
    "cross-section missile": ("Ship Weapons", "Missiles"),
    "proximity missile": ("Ship Weapons", "Missiles"),
    "torpedo": ("Ship Weapons", "Torpedoes"),
    "strike torpedo": ("Ship Weapons", "Torpedoes"),
    "heat seeking strike torpedo": ("Ship Weapons", "Torpedoes"),
    "mining laser": ("Ship Weapons", "Mining Lasers"),
}

CLASS_CODE_MAP = {"CIV": "Civilian", "MIL": "Military", "IND": "Industrial",
                  "CMP": "Competition", "STL": "Stealth", "STH": "Stealth", "MIN": "Mining",
                  "DEF": "Defensive", "RAC": "Racing"}

# Normalize the "Class:" header value. Source data sometimes ships STH for
# Stealth (data corruption / OCR slip), or arrives mid-case.
CLASS_NORMALIZE = {
    "stl": "Stealth", "sth": "Stealth", "stealth": "Stealth",
    "civ": "Civilian", "civilian": "Civilian",
    "mil": "Military", "military": "Military",
    "ind": "Industrial", "industrial": "Industrial",
    "cmp": "Competition", "comp": "Competition", "competition": "Competition",
    "min": "Mining", "mining": "Mining",
    "def": "Defensive", "defensive": "Defensive",
    "rac": "Racing", "racing": "Racing",
}

HEADER_KEYS = {"item type", "manufacturer", "size", "grade", "class", "tracking signal"}

PREFIX_RE = re.compile(r"^item_(name|desc)_?", re.IGNORECASE)
SUFFIX_RE = re.compile(r"_(SCItem|short)$", re.IGNORECASE)
SIZE_IN_KEY_RE = re.compile(r"_S(\d+)(?=_|$)", re.IGNORECASE)
BRACKET_NAME_RE = re.compile(r"\s*\[([A-Z]{2,4})-S(\d+)-([A-Z])\]\s*$")
STATS_SPLIT_RE = re.compile(r"\s+\|\s+")
KEY_VALUE_RE = re.compile(r"^([A-Za-z][A-Za-z0-9 /&\-]*?):\s*(.*)$")
SKIP_NAME_SEGMENT_RE = re.compile(
    r"^(S\d+|Size\d+|Gen\d+|MK\d+|VNG|EM|IR|CS|XS|short|SCItem|Cargo|shared|Strike|TL|Bespoke|laserbeam)$",
    re.IGNORECASE)


def normalize_class(value):
    if not value:
        return None
    v = value.strip()
    return CLASS_NORMALIZE.get(v.lower(), v)


def normalize_key(raw_key):
    m = PREFIX_RE.match(raw_key)
    if not m:
        return None, None
    kind = m.group(1).lower()
    rest = SUFFIX_RE.sub("", raw_key[m.end():])
    return kind, rest


def normalize_size(value):
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    if s[0] in ("S", "s"):
        s = s[1:]
    try:
        return "S" + str(int(s))
    except ValueError:
        return str(value).strip()


def looks_like_description(text):
    if not text:
        return False
    return ("--- STATS ---" in text) or ("\\n" in text and len(text) > 80)


def split_camel(s):
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)


def fallback_name_from_key(item_key, manufacturer=None, weapon_type=None, size=None):
    if not item_key:
        return item_key
    parts = [p for p in item_key.split("_") if p]
    while len(parts) > 1 and SKIP_NAME_SEGMENT_RE.match(parts[-1]):
        parts.pop()
    last = parts[-1] if parts else item_key
    spaced = split_camel(last)
    if weapon_type and weapon_type.lower() in spaced.lower():
        bits = []
        if manufacturer:
            bits.append(manufacturer.split()[0])
        if size:
            bits.append(size)
        bits.append(spaced)
        return " ".join(bits)
    return spaced


def parse_description(text):
    text = (text or "")
    text = text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\r\n", "\n")
    header = {}
    stats = {}
    desc_lines = []
    if "--- STATS ---" in text:
        before, after = text.split("--- STATS ---", 1)
    else:
        before, after = text, ""
    mode = "header"
    for raw in before.splitlines():
        stripped = raw.strip()
        if not stripped:
            if mode == "header":
                mode = "prose"
            elif mode == "prose":
                desc_lines.append("")
            continue
        m = KEY_VALUE_RE.match(stripped)
        if mode == "header":
            if m and m.group(1).strip().lower() in HEADER_KEYS:
                header[m.group(1).strip().lower()] = m.group(2).strip()
                continue
            mode = "prose"
        if m:
            key = m.group(1).strip()
            value = m.group(2).strip()
            looks_like_stat = bool(value) and (
                re.search(r"[\d%]", value) or "|" in value
                or value.endswith(("m", "s", "kg", "K")))
            if looks_like_stat and key.lower() not in {"note"}:
                stats[key] = value
                continue
        desc_lines.append(raw.rstrip())
    for raw in after.splitlines():
        line = raw.strip()
        if not line:
            continue
        for chunk in STATS_SPLIT_RE.split(line):
            chunk = chunk.strip()
            if not chunk or ":" not in chunk:
                continue
            k, v = chunk.split(":", 1)
            k = k.strip()
            v = v.strip()
            if k and v:
                stats[k] = v
    description = "\n".join(desc_lines).strip()
    description = re.sub(r"\n{3,}", "\n\n", description)
    return header, description, stats


def detect_from_key(key):
    if not key:
        return {}
    parts = [p for p in key.split("_") if p]
    if not parts:
        return {}
    info = {"parts": parts, "prefix": parts[0].upper()}
    if info["prefix"] in CATEGORY_FROM_PREFIX:
        info["category"], info["subcategory"] = CATEGORY_FROM_PREFIX[info["prefix"]]
    for p in parts:
        if p.upper() in MANUFACTURER_FROM_PREFIX:
            info.setdefault("manufacturer", MANUFACTURER_FROM_PREFIX[p.upper()])
            break
    for p in parts:
        if p in WEAPON_TYPE_FROM_SEGMENT:
            cat, sub = WEAPON_TYPE_FROM_SEGMENT[p]
            info["category"] = cat
            info["subcategory"] = sub
            info["weapon_type"] = split_camel(p)
            break
    if "category" not in info:
        for p in parts:
            if p.upper() in KEY_FRAGMENT_FROM_SEGMENT:
                info["category"], info["subcategory"] = KEY_FRAGMENT_FROM_SEGMENT[p.upper()]
                break
    m = SIZE_IN_KEY_RE.search("_" + key + "_")
    if m:
        try:
            info["size"] = "S" + str(int(m.group(1)))
        except ValueError:
            pass
    return info


def build_item(item_key, name_text, desc_text):
    if name_text and looks_like_description(name_text):
        if not desc_text:
            desc_text = name_text
        name_text = None
    header, description, stats = (
        parse_description(desc_text) if desc_text else ({}, "", {}))
    keyinfo = detect_from_key(item_key)

    cat = sub = None
    item_type = (header.get("item type") or "").strip().rstrip(".")
    if item_type:
        key_l = item_type.lower()
        if key_l in ITEM_TYPE_TO_CATEGORY:
            cat, sub = ITEM_TYPE_TO_CATEGORY[key_l]
        else:
            cat = keyinfo.get("category") or "Uncategorised"
            sub = item_type
    if not cat:
        cat = keyinfo.get("category")
        sub = keyinfo.get("subcategory")
    if not cat:
        cat = "Uncategorised"
        sub = "Other"

    size_raw = header.get("size") or keyinfo.get("size")
    size = normalize_size(size_raw) if size_raw else None
    grade = (header.get("grade") or "").strip() or None
    industry = normalize_class(header.get("class"))
    manufacturer = (header.get("manufacturer") or "").strip() or keyinfo.get("manufacturer")
    tracking = (header.get("tracking signal") or "").strip() or None

    name = None
    if name_text:
        nt = name_text.strip()
        m = BRACKET_NAME_RE.search(nt)
        if m:
            cls_code, sz_num, gr = m.group(1), m.group(2), m.group(3)
            if not industry:
                industry = normalize_class(CLASS_CODE_MAP.get(cls_code, cls_code))
            if not size:
                try:
                    size = "S" + str(int(sz_num))
                except ValueError:
                    pass
            if not grade:
                grade = gr
            name = BRACKET_NAME_RE.sub("", nt).strip()
        else:
            name = nt

    if not name:
        first_line = (description.splitlines()[0].strip() if description else "")
        if first_line and ":" not in first_line and len(first_line) < 60:
            name = first_line
            rest = description.split("\n", 1)[1] if "\n" in description else ""
            description = rest.strip()

    if not name:
        name = fallback_name_from_key(
            item_key,
            manufacturer=manufacturer,
            weapon_type=keyinfo.get("weapon_type"),
            size=size)

    item = {"id": item_key, "name": name, "category": cat, "subcategory": sub or "Other"}
    if size:
        item["size"] = size
    if grade:
        item["grade"] = grade
    if industry:
        item["industry"] = industry
    if manufacturer:
        item["manufacturer"] = manufacturer
    if tracking:
        item["tracking"] = tracking
    if description:
        item["description"] = description
    item["image"] = ""
    item["stats"] = stats
    return item


def parse_tsv(stream):
    reader = csv.reader(stream, delimiter="\t", quoting=csv.QUOTE_NONE)
    saw_header = False
    for row in reader:
        if not row:
            continue
        if not saw_header:
            saw_header = True
            if row[0].strip().lower() == "key":
                continue
        while len(row) < 5:
            row.append("")
        yield row[0], row[1], row[2]


def build_items(rows):
    grouped = defaultdict(lambda: {"name": None, "desc": None})
    for raw_key, original, current in rows:
        kind, item_key = normalize_key((raw_key or "").strip())
        if not kind or not item_key:
            continue
        text = current if (current or "").strip() else original
        if not text or not text.strip():
            continue
        existing = grouped[item_key][kind]
        if existing is None or len(text) > len(existing):
            grouped[item_key][kind] = text
    items = [build_item(k, p["name"], p["desc"]) for k, p in grouped.items()]
    items.sort(key=lambda x: (x.get("category", ""), x.get("subcategory", ""),
                              x.get("size", ""), x.get("name", "")))
    return items


def main(argv=None):
    ap = argparse.ArgumentParser(description="Convert SC TSV export -> items.json.")
    ap.add_argument("input", nargs="?", help="TSV input (stdin if omitted)")
    ap.add_argument("-o", "--output", help="Output items.json (stdout if omitted)")
    ap.add_argument("--merge", metavar="ITEMS_JSON",
                    help="Existing items.json to merge with (new entries win)")
    ap.add_argument("--keep-existing-images", action="store_true",
                    help="When merging, keep image URLs from the existing file")
    ap.add_argument("--verbose", "-v", action="store_true",
                    help="Print per-category summary to stderr")
    args = ap.parse_args(argv)

    if args.input:
        with open(args.input, "r", encoding="utf-8", newline="") as f:
            rows = list(parse_tsv(f))
    else:
        rows = list(parse_tsv(sys.stdin))

    new_items = build_items(rows)

    if args.merge:
        try:
            with open(args.merge, "r", encoding="utf-8") as f:
                existing = json.load(f).get("items", [])
        except FileNotFoundError:
            existing = []
        by_id = {it["id"]: it for it in existing}
        for it in new_items:
            old = by_id.get(it["id"])
            if old and args.keep_existing_images and old.get("image"):
                it["image"] = old["image"]
            by_id[it["id"]] = it
        merged = list(by_id.values())
        merged.sort(key=lambda x: (x.get("category", ""), x.get("subcategory", ""),
                                   x.get("size", ""), x.get("name", "")))
        result = {"items": merged}
    else:
        result = {"items": new_items}

    if args.verbose:
        summary = defaultdict(lambda: defaultdict(int))
        total = len(result["items"])
        for it in result["items"]:
            summary[it.get("category", "?")][it.get("subcategory", "?")] += 1
        sys.stderr.write("Imported {} items\n".format(total))
        for cat in sorted(summary):
            n = sum(summary[cat].values())
            sys.stderr.write("  {} ({})\n".format(cat, n))
            for sub in sorted(summary[cat]):
                sys.stderr.write("    - {}: {}\n".format(sub, summary[cat][sub]))

    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        sys.stderr.write("Wrote {} items to {}\n".format(len(result["items"]), args.output))
    else:
        sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
