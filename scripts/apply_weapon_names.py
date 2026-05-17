#!/usr/bin/env python3
"""Apply curated ship-weapon names from weapon_names.json to items.json.

The catalog build script falls back to a generic name (manufacturer + size +
weapon type, e.g. "Esperia S2 Ballistic Cannon") when the source TSV has no
clean item name. The real product name ("Deadbolt II") lives in the item's
description prose. scripts/weapon_names.json holds a reviewed id -> name map;
this script applies it to every items.json copy.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP_PATH = os.path.join(ROOT, "scripts", "weapon_names.json")
TARGETS = [
    os.path.join(ROOT, "data", "items.json"),
    os.path.join(ROOT, "public", "data", "items.json"),
]


def main():
    with open(MAP_PATH, encoding="utf-8") as f:
        names = json.load(f)["names"]

    for path in TARGETS:
        if not os.path.exists(path):
            print("skip (not found):", path)
            continue
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
        weapons = [it for it in doc.get("items", [])
                   if it.get("category") == "Ship Weapons"]
        weapon_ids = {it["id"] for it in weapons}

        missing = weapon_ids - set(names)
        unknown = set(names) - weapon_ids
        if missing:
            sys.exit("Ship Weapons with no mapped name: "
                     + ", ".join(sorted(missing)))
        if unknown:
            sys.exit("Mapped ids that are not Ship Weapons in %s: %s"
                     % (path, ", ".join(sorted(unknown))))

        changed = 0
        for it in weapons:
            new = names[it["id"]]
            if it.get("name") != new:
                it["name"] = new
                changed += 1
        with open(path, "w", encoding="utf-8") as f:
            f.write(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
        print("%s: renamed %d/%d ship weapons" % (path, changed, len(weapons)))


if __name__ == "__main__":
    main()
