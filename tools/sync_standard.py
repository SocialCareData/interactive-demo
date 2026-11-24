"""Vendor the parts of the Social Care Interoperability Standards this demo needs.

Does a shallow, sparse clone of the standard repo into a temporary directory and
copies src/_data/model, src/assets/scripts and two stylesheets into
vendor/standard/, preserving the src/... layout (the vendored scripts find the
repo root as Path(__file__).parents[3]). Writes vendor/standard/SOURCE.txt.

Never hand-edit vendor/. Re-run this script instead.

Usage:
    python tools/sync_standard.py [--ref referrals_iteration] [--repo URL] [--drop-examples]
"""

import argparse
import datetime as dt
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "standard"

DEFAULT_REPO = "https://github.com/SocialCareData/standard.git"
DEFAULT_REF = "referrals_iteration"  # switch to "main" once PR #110 merges

SPARSE_DIRS = ["src/_data/model", "src/assets/scripts", "src/_styles"]
STYLE_FILES = ["_root.css", "base.css"]


def git(*args, cwd=None):
    result = subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    )
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--ref", default=DEFAULT_REF, help="branch or tag to vendor")
    parser.add_argument("--repo", default=DEFAULT_REPO, help="git URL of the standard repo")
    parser.add_argument(
        "--drop-examples",
        action="store_true",
        help="drop src/_data/model/**/examples (kept by default as a shape reference)",
    )
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="scd-standard-") as tmp:
        clone = Path(tmp) / "standard"
        print(f"Cloning {args.repo} @ {args.ref} (shallow, sparse)...")
        git(
            "clone", "--depth", "1", "--filter=blob:none", "--sparse",
            "--branch", args.ref, args.repo, str(clone),
        )
        git("sparse-checkout", "set", *SPARSE_DIRS, cwd=clone)
        sha = git("rev-parse", "HEAD", cwd=clone)
        commit_date = git("log", "-1", "--format=%cI", cwd=clone)

        for d in SPARSE_DIRS[:2]:
            if not (clone / d).is_dir():
                sys.exit(f"Expected {d} in the standard repo, but it is missing.")

        if VENDOR.exists():
            shutil.rmtree(VENDOR)
        VENDOR.mkdir(parents=True)

        skip = {"__pycache__"} | ({"examples"} if args.drop_examples else set())
        shutil.copytree(
            clone / "src/_data/model",
            VENDOR / "src/_data/model",
            ignore=lambda _dir, names: {n for n in names if n in skip},
        )
        shutil.copytree(
            clone / "src/assets/scripts",
            VENDOR / "src/assets/scripts",
            ignore=shutil.ignore_patterns("__pycache__"),
        )
        styles_out = VENDOR / "src/_styles"
        styles_out.mkdir(parents=True)
        for name in STYLE_FILES:
            src = clone / "src/_styles" / name
            if src.exists():
                shutil.copy2(src, styles_out / name)
            else:
                print(f"Warning: src/_styles/{name} not found in the standard repo.")

    (VENDOR / "SOURCE.txt").write_text(
        "\n".join([
            f"repo: {args.repo}",
            f"ref: {args.ref}",
            f"commit: {sha}",
            f"commit_date: {commit_date}",
            f"synced: {dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')}",
            f"examples_dropped: {args.drop_examples}",
            "",
        ]),
        encoding="utf-8",
        newline="\n",
    )
    files = sum(1 for p in VENDOR.rglob("*") if p.is_file())
    print(f"Vendored {files} files from {args.ref} @ {sha[:12]} into {VENDOR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
