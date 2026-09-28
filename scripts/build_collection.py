#!/usr/bin/env python3
"""Build data/collection.json from the raw scrape in data/collection.jsonl.

Each jsonl line is the output of scripts/fragrantica-extract.js for one
perfume page. Re-run this after adding or removing lines.
"""
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEASONS = ("winter", "spring", "summer", "fall")


def split_name_brand(h1: str, brand_slug: str) -> tuple[str, str]:
    name_brand = re.sub(r" for (women and men|men|women)$", "", h1)
    brand = brand_slug.replace("-", " ")
    if name_brand.lower().endswith(brand.lower()):
        return name_brand[: -len(brand)].strip(), name_brand[-len(brand):]
    return name_brand, brand


def build(raw: dict) -> dict:
    brand_slug, rest = raw["slug"].split("/")
    pid = int(rest.rsplit("-", 1)[1])
    m = re.search(r" - a (?:new )?fragrance for (women and men|men|women)(?: (\d{4}))?", raw["title"])
    gender = m.group(1) if m else None
    year = int(m.group(2)) if m and m.group(2) else None
    name, brand = split_name_brand(raw["h1"], brand_slug)

    wear = raw["wear"]
    season_total = sum(wear[s] for s in SEASONS) or 1
    time_total = (wear["day"] + wear["night"]) or 1
    return {
        "id": pid,
        "name": name,
        "brand": brand,
        "year": year,
        "gender": gender,
        "url": f"https://www.fragrantica.com/perfume/{raw['slug']}.html",
        "thumb": f"https://fimgs.net/mdimg/perfume-thumbs/dark-m.{pid}.2x.webp",
        "rating": raw["rating"],
        "ratingVotes": raw["votes"],
        "accords": raw["accords"],
        "seasonVotes": {s: wear[s] for s in SEASONS},
        "timeVotes": {"day": wear["day"], "night": wear["night"]},
        "season": {s: round(wear[s] / season_total, 3) for s in SEASONS},
        "dayNight": {"day": round(wear["day"] / time_total, 3), "night": round(wear["night"] / time_total, 3)},
        "sentiment": raw["likes"],
        "notes": raw["notes"],
    }


def main() -> None:
    lines = (ROOT / "data/collection.jsonl").read_text().splitlines()
    rows = [build(json.loads(line)) for line in lines if line.strip()]
    rows.sort(key=lambda f: (f["brand"].lower(), f["name"].lower()))
    out = {
        "source": "fragrantica.com/@doeszen wardrobe (Have)",
        "fetched": date.today().isoformat(),
        "fragrances": rows,
    }
    (ROOT / "data/collection.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(rows)} fragrances -> data/collection.json")


if __name__ == "__main__":
    main()
