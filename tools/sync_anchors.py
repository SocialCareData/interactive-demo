"""Record the HTML anchor ids on the published standard pages.

The Explained tab deep-links each field to its row on the standard site
(e.g. PUB06_referrals_standard#referral-concern). The ids are not derived
mechanically from class names (ServiceEpisode rows are #episode-…), so
build.py checks every link it makes against this list, and falls back to the
class anchor when a field has no row.

Needs network access; run when the standard site changes. Writes data/anchors.json.

    python tools/sync_anchors.py
"""

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "anchors.json"

# Module -> published page. PUB06 points at the PR #110 preview until it merges.
PAGES = {
    "person": "https://standard.socialcaredata.io/PUB01_person_standard",
    "safeguarding": "https://standard.socialcaredata.io/PUB02_safeguarding_standard",
    "assessments-and-plans": "https://standard.socialcaredata.io/PUB05_assessments_and_plans_standard",
    "referrals": "https://pr-110.socialcaredata-standard-preview.pages.dev/PUB06_referrals_standard",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "socialcare-demo-anchor-sync"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def main():
    result = {}
    for module, url in PAGES.items():
        ids = re.findall(r'\bid="([^"]+)"', fetch(url))
        result[module] = {"url": url, "ids": sorted(set(ids))}
        print(f"{module}: {len(set(ids))} ids from {url}")
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
