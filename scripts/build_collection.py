#!/usr/bin/env python3
"""Build the app's data files from raw Fragrantica scrapes.

- data/collection.jsonl -> data/collection.json: David's wardrobe (the demo).
- data/catalog.jsonl -> data/catalog.json: bottles outside the wardrobe that
  Fragella lacks (friends' niche and indie bottles), searchable in the app.
- data/calibration.jsonl -> data/calibration.json: well-voted bottles across
  every accord family, used only to fit the engine (scripts/fit-accords.mjs);
  the app never loads them.
- data/originals.jsonl -> data/originals.json: the bottles that dupes in the
  wardrobe or catalog are inspired by. data/dupes.json pairs them up (dupe
  slug, original slug), and each dupe carries a summary of its original's
  votes as `original`. The fit uses them too; the app doesn't load the file.
- data/parfumo.jsonl: Parfumo's longevity and sillage ratings (0-10 averages,
  with vote counts) by Fragrantica id, which Fragrantica's pages no longer
  show. Each matching bottle carries them as `parfumo`.

Each jsonl line is the output of scripts/fragrantica-extract.js for one
perfume page. Re-run this after adding or removing lines.
"""
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEASONS = ("winter", "spring", "summer", "fall")
FILES = (
    ("collection", "fragrantica.com/@doeszen wardrobe (Have)"),
    ("catalog", "fragrantica.com, bottles added for other people's collections"),
    ("calibration", "fragrantica.com, well-voted bottles for fitting the engine"),
    ("originals", "fragrantica.com, the originals that dupes in data/ are inspired by"),
)
# What a dupe keeps of its original: enough to name it and lean on its votes.
ORIGINAL_KEYS = ("id", "name", "brand", "url", "thumb", "rating", "ratingVotes", "seasonVotes", "timeVotes", "season", "dayNight")


def split_name_brand(h1: str, brand_slug: str) -> tuple[str, str]:
    name_brand = re.sub(r" for (women and men|men|women)$", "", h1)
    # The slug drops punctuation ("d-Annam" for "d'Annam"), so match word by word.
    words = [re.escape(w) for w in brand_slug.split("-") if w]
    m = re.search(r"\s(" + r"[\W_]*".join(words) + r")$", name_brand, re.I)
    if m:
        return name_brand[: m.start()].strip(), m.group(1)
    return name_brand, brand_slug.replace("-", " ")


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
        **({"noteVotes": raw["noteVotes"]} if raw.get("noteVotes") else {}),
    }


def read(stem: str) -> list[dict]:
    src = ROOT / f"data/{stem}.jsonl"
    lines = src.read_text().splitlines() if src.exists() else []
    return [build(json.loads(line)) for line in lines if line.strip()]


def originals_by_dupe() -> dict[int, dict]:
    """Dupe id -> summary of its original, from data/dupes.json and data/originals.jsonl."""
    pairs = json.loads((ROOT / "data/dupes.json").read_text())
    by_id = {f["id"]: f for f in read("originals")}
    slug_id = lambda slug: int(slug.rsplit("-", 1)[1])
    out = {}
    for dupe, original in pairs:
        f = by_id.get(slug_id(original))
        if f is None:
            raise SystemExit(f"data/dupes.json: {original} is not in data/originals.jsonl")
        out[slug_id(dupe)] = {k: f[k] for k in ORIGINAL_KEYS}
    return out


def parfumo_by_id() -> dict[int, dict]:
    """Fragrantica id -> Parfumo longevity and sillage, from data/parfumo.jsonl."""
    out = {}
    for line in (ROOT / "data/parfumo.jsonl").read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        out[r["id"]] = {
            "url": f"https://www.parfumo.com{r['path']}",
            "longevity": r["longevity"][0],
            "sillage": r["sillage"][0],
            "votes": min(r["longevity"][1], r["sillage"][1]),
        }
    return out


def write(stem: str, source: str, originals: dict[int, dict], parfumo: dict[int, dict]) -> None:
    out = ROOT / f"data/{stem}.json"
    rows = read(stem)
    for f in rows:
        if f["id"] in originals:
            f["original"] = originals[f["id"]]
        if f["id"] in parfumo:
            f["parfumo"] = parfumo[f["id"]]
    rows.sort(key=lambda f: (f["brand"].lower(), f["name"].lower()))
    # "fetched" is the last time the data changed, so a rebuild alone keeps it.
    old = json.loads(out.read_text()) if out.exists() else {}
    fetched = old.get("fetched") if old.get("fragrances") == rows else date.today().isoformat()
    body = {"source": source, "fetched": fetched, "fragrances": rows}
    out.write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(rows)} fragrances -> data/{stem}.json")


def main() -> None:
    originals, parfumo = originals_by_dupe(), parfumo_by_id()
    for stem, source in FILES:
        write(stem, source, originals, parfumo)


if __name__ == "__main__":
    main()
