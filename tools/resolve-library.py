#!/usr/bin/env python3
"""
Resolve a pasted list of film and TV titles into The Archive's record format.

Reads titles (one per line) and resolves each one in two stages:

  1. CheapCharts Search  -> iTunes store ID + release year
  2. iTunes Lookup       -> artwork URL, genre, exact title, media kind

CheapCharts is used for resolution because its product page URL carries the
iTunes store ID, which is the same key The Archive uses for dedup and for the
videos:// deep link. iTunes Lookup then fills in the fields CheapCharts does
not reliably return (artwork and genre).

Output is JSON matching the LibraryItem CKRecord field names, ready to import.
Nothing is written to CloudKit here: this step is deliberately separate so the
matches can be reviewed before anything touches the database.

Usage:
    ./resolve-library.py titles.txt -o resolved.json
    pbpaste | ./resolve-library.py - -o resolved.json

Input format: one title per line. A trailing year in parentheses disambiguates
and is strongly recommended for common titles:

    Seven Samurai (1954)
    Akira
    Severance

Lines that are blank or start with # are ignored.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timezone

CHEAPCHARTS = "https://buster.cheapcharts.de/v1/gptapi/Search.php"
ITUNES_LOOKUP = "https://itunes.apple.com/lookup"

# Both APIs rate-limit. iTunes in particular starts returning empty result sets
# under sustained load, which looks like "not found" rather than an error, so
# pace requests rather than racing them.
DELAY_SECONDS = 1.5

# The store ID is the trailing path component of the product page URL, e.g.
# https://www.cheapcharts.com/us/itunes/movies/474656244?utm_source=...
STORE_ID_RE = re.compile(r"/(\d+)(?:\?|$)")

# "Title (1954)" -> ("Title", 1954)
YEAR_SUFFIX_RE = re.compile(r"^(.*?)\s*\((\d{4})\)\s*$")


def fetch_json(url, timeout=20):
    """
    Fetch JSON over HTTPS using curl.

    urllib is not used here: some python builds (including the one shipped in
    several macOS toolchains) are compiled without the _ssl module, and every
    HTTPS request fails with "unknown url type: https". curl is present on
    every macOS system and has no such gap.
    """
    result = subprocess.run(
        ["curl", "-sS", "--fail", "-m", str(timeout),
         "-H", "User-Agent: TheArchive-Importer/1.0", url],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or f"curl exit {result.returncode}").strip())
    return json.loads(result.stdout)


def parse_line(line):
    """Split an input line into (title, year or None)."""
    m = YEAR_SUFFIX_RE.match(line)
    if m:
        return m.group(1).strip(), int(m.group(2))
    return line.strip(), None


def cheapcharts_candidates(title):
    """Search CheapCharts; return candidates carrying an iTunes store ID."""
    qs = urllib.parse.urlencode({
        "action": "search",
        "query": title,
        "store": "itunes",
        "country": "us",
        "itemType": "all",
        "limit": 20,
    })
    data = fetch_json(f"{CHEAPCHARTS}?{qs}")
    if data.get("status") != "success":
        return []

    raw = data.get("results")
    # The endpoint returns a flat list for Search, but other endpoints nest
    # under results.buymovies. Accept both so this does not break if the
    # shape shifts.
    if isinstance(raw, dict):
        items = []
        for value in raw.values():
            if isinstance(value, list):
                items.extend(value)
    else:
        items = raw or []

    out = []
    for item in items:
        url = item.get("cheapChartsProductPageUrl") or ""
        m = STORE_ID_RE.search(url.split("?")[0] + "?")
        if not m:
            continue
        out.append({
            "store_id": m.group(1),
            "title": item.get("title"),
            "year": int(item["releaseYear"]) if str(item.get("releaseYear") or "").isdigit() else None,
            "media_type": item.get("mediaType"),
        })
    return out


def pick(candidates, want_title, want_year):
    """
    Choose a single candidate, or None if the match is not clear.

    Ambiguity is reported rather than guessed: importing the wrong film is
    worse than reporting one that needs a manual decision.
    """
    if not candidates:
        return None, "not_found"

    def norm(s):
        return re.sub(r"[^a-z0-9]+", "", (s or "").lower())

    target = norm(want_title)
    exact = [c for c in candidates if norm(c["title"]) == target]

    # CheapCharts search is fuzzy and matches on individual words, so a title
    # that does not exist still returns a long list of unrelated films. Without
    # at least one exact title match, treat it as not found rather than
    # ambiguous: there is nothing here for a human to choose between.
    if not exact:
        return None, "not_found"

    if want_year is not None:
        year_matched = [c for c in exact if c["year"] == want_year]
        if len(year_matched) == 1:
            return year_matched[0], "ok"
        if len(year_matched) > 1:
            # Same title and year, usually a duplicate store listing for
            # different editions. They are interchangeable for our purposes.
            return year_matched[0], "ok"
        # Exact title exists but not in the requested year: the year is
        # probably wrong, so surface it rather than silently picking another.
        return None, "ambiguous"

    if len(exact) == 1:
        return exact[0], "ok"

    # Several listings share the exact title. If they also share a year they
    # are the same work listed more than once; otherwise a real decision is
    # needed (e.g. a remake).
    years = {c["year"] for c in exact}
    if len(years) == 1:
        return exact[0], "ok"
    return None, "ambiguous"


def itunes_details(store_id):
    """Fetch artwork, genre and canonical title for an iTunes store ID."""
    qs = urllib.parse.urlencode({"id": store_id})
    data = fetch_json(f"{ITUNES_LOOKUP}?{qs}")
    results = data.get("results") or []
    if not results:
        return None
    r = results[0]

    kind = r.get("kind") or ""
    wrapper = r.get("wrapperType") or ""
    is_film = kind == "feature-movie" or wrapper == "track"

    artwork = r.get("artworkUrl100") or ""
    # Request a poster-shaped image rather than the 100px thumbnail.
    artwork = artwork.replace("100x100bb", "600x900bb").replace("100x100", "600x900")

    year = None
    release = r.get("releaseDate") or ""
    if len(release) >= 4 and release[:4].isdigit():
        year = int(release[:4])

    genre = r.get("primaryGenreName")
    return {
        "title": r.get("trackName") or r.get("collectionName"),
        "year": year,
        "type": "film" if is_film else "series",
        "artworkURL": artwork,
        "genres": [genre] if genre else [],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="file with one title per line, or - for stdin")
    ap.add_argument("-o", "--output", default="resolved.json",
                    help="where to write resolved records (default: resolved.json)")
    ap.add_argument("--delay", type=float, default=DELAY_SECONDS,
                    help=f"seconds between API calls (default: {DELAY_SECONDS})")
    ap.add_argument("--start-film", type=int, default=1,
                    help="first MV-#### catalog number (default: 1)")
    ap.add_argument("--start-series", type=int, default=1,
                    help="first SV-#### catalog number (default: 1)")
    args = ap.parse_args()

    if shutil.which("curl") is None:
        print("curl is required but was not found on PATH.", file=sys.stderr)
        return 1

    stream = sys.stdin if args.input == "-" else open(args.input, encoding="utf-8")
    with stream as fh:
        lines = [ln.strip() for ln in fh]

    titles = [ln for ln in lines if ln and not ln.startswith("#")]
    if not titles:
        print("No titles found in input.", file=sys.stderr)
        return 1

    print(f"Resolving {len(titles)} titles...\n", file=sys.stderr)

    resolved, problems = [], []
    film_n, series_n = args.start_film, args.start_series
    now = datetime.now(timezone.utc).isoformat()

    for i, line in enumerate(titles, 1):
        want_title, want_year = parse_line(line)
        try:
            candidates = cheapcharts_candidates(want_title)
        except Exception as exc:
            problems.append({"input": line, "reason": f"search_error: {exc}"})
            print(f"  ! {line} — search error: {exc}", file=sys.stderr)
            time.sleep(args.delay)
            continue

        choice, status = pick(candidates, want_title, want_year)
        if choice is None:
            # Only report candidates whose title actually matches. The search
            # is fuzzy, so the raw list is mostly noise and would make a
            # manual decision harder rather than easier.
            def _norm(s):
                return re.sub(r"[^a-z0-9]+", "", (s or "").lower())

            relevant = [c for c in candidates if _norm(c["title"]) == _norm(want_title)]
            problems.append({
                "input": line,
                "reason": status,
                "candidates": [
                    {"title": c["title"], "year": c["year"], "iTunesID": c["store_id"]}
                    for c in relevant[:5]
                ],
            })
            label = "no match" if status == "not_found" else f"{len(relevant)} candidates"
            print(f"  ? {line} — {label}, skipped", file=sys.stderr)
            time.sleep(args.delay)
            continue

        time.sleep(args.delay)
        try:
            details = itunes_details(choice["store_id"])
        except Exception as exc:
            problems.append({"input": line, "reason": f"lookup_error: {exc}"})
            print(f"  ! {line} — lookup error: {exc}", file=sys.stderr)
            time.sleep(args.delay)
            continue

        if not details:
            problems.append({"input": line, "reason": "itunes_lookup_empty",
                             "iTunesID": choice["store_id"]})
            print(f"  ! {line} — iTunes lookup returned nothing", file=sys.stderr)
            time.sleep(args.delay)
            continue

        if details["type"] == "film":
            catalog = f"MV-{film_n:04d}"
            film_n += 1
        else:
            catalog = f"SV-{series_n:04d}"
            series_n += 1

        resolved.append({
            "catalogID": catalog,
            "iTunesID": choice["store_id"],
            "title": details["title"] or choice["title"],
            "year": details["year"] or choice["year"] or 0,
            "type": details["type"],
            "artworkURL": details["artworkURL"],
            "genres": details["genres"],
            "watched": False,
            "dateAdded": now,
        })
        print(f"  ✓ {details['title']} ({details['year']})  {choice['store_id']}",
              file=sys.stderr)
        time.sleep(args.delay)

    payload = {"items": resolved, "problems": problems}
    with open(args.output, "w", encoding="utf-8") as out:
        json.dump(payload, out, indent=2)

    print(f"\n{len(resolved)} resolved, {len(problems)} need attention.", file=sys.stderr)
    print(f"Wrote {args.output}", file=sys.stderr)
    if problems:
        print("Review the 'problems' list; ambiguous entries include candidate "
              "iTunes IDs so you can pick one and re-run with an explicit year.",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
