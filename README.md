# Example CMS: a social care standards demo

A fictional case management system ("Example CMS", Anytown Borough Council), built on synthetic data that conforms to the [Social Care Interoperability Standards](https://standard.socialcaredata.io). Every screen sits beside the same data according to the standard: the raw JSON-LD, an explanation of each field, and a map of how the records link.

It's a snapshot as at **Thursday 26 November 2026**. Everything in it is fictional. See [PLAN.md](PLAN.md) for the full brief.

## Run it locally

From the repository root:

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

python tools/validate.py          # SHACL + integrity checks; writes site/data/validation.json
python tools/build.py             # writes site/data/bundle.json
python -m http.server -d site 8000
```

Then open <http://localhost:8000>. The first `validate.py` run builds the SHACL shapes from `vendor/standard` and caches them in `.cache/`. Use `--rebuild` to force a fresh build.

## How it fits together

| Path | What it is |
| --- | --- |
| `vendor/standard/` | The standard's schemas, contexts, scripts and styles. Written by `tools/sync_standard.py`. **Never edit by hand.** `SOURCE.txt` records the commit. |
| `data/records/` | The synthetic dataset: one JSON-LD record per file. The folder decides which SHACL shape it must satisfy. |
| `data/external-refs.yaml` | Identifiers that deliberately point at records held elsewhere. |
| `data/annotations.yaml` | Open questions (gaps) shown with ◆ on screens and on the Open questions page. |
| `data/journeys.yaml` | The three person stories (Riley's is the one to present). Each step opens a page and sets it up (view, tab, highlighted value, open question). `validate.py` checks every route, record, path and question it names. |
| `data/ui.yaml` | Front-end-only content (allocations, case notes, tasks, workflow states). Shown greyed out, never in the JSON-LD. |
| `data/anchors.json` | Anchor ids on the published standard pages, used for field deep links. Refresh with `tools/sync_anchors.py`. |
| `tools/validate.py` | SHACL validation, plus: every JSON key is defined by the module context, every identifier resolves (or is listed as external), no date after the snapshot, and only the expected concern is still unassigned. |
| `tools/build.py` | Bundles records, identifier index, edges, field documentation and enum labels for the front end. |
| `site/` | The static site: plain HTML, CSS and ES modules, with d3 vendored in `site/lib/`. No build step for the JavaScript. |

## Adding a story step

Add a step to `data/journeys.yaml`:

```yaml
- title: A request to CAMHS
  label: To CAMHS                           # a word or two for the timeline in the story bar
  route: "#/record/request/REQ-2026-0301"   # any page in the demo
  view: split                               # screen | split | data
  tab: data                                 # data | explained | map
  xray: false                               # label values with their field names
  task: Select who the request is about.    # optional: the viewer selects the value at `trace`
  trace: /subject                           # JSON pointer in the page's record
  gap: G12                                  # open question to open on the page
  text: >
    Two or three plain sentences on what to notice.
```

Then run `python tools/validate.py && python tools/build.py`. Steps are shared as links like `#/story/riley/6`.

Each story walks one person's whole timeline, one step per entry, and the story bar shows that timeline.
Most steps ask the viewer to select the link back to the record before (`linkedRecord`, `respondsTo`), so the
chain from record to record is something they do. If the page has a link to the next step (a "Followed up by"
link, the other system's view), it's marked "Next". "Show me", or the → key, does a step's task for the
viewer. Steps open pages at the top and never scroll the screen by themselves.

## Updating the standard

```bash
python tools/sync_standard.py --ref referrals_iteration   # switch to --ref main once PR #110 merges
python tools/validate.py --rebuild
```

If a record stops validating because the standard changed, fix the record. If the standard looks wrong or awkward, add an open question to `data/annotations.yaml` rather than working around it.

## Deployment

`.github/workflows/pages.yml` validates, builds and deploys `site/` to GitHub Pages on every push to `main`. All asset paths are relative, so the site works under `/interactive-demo/` (https://socialcaredata.github.io/interactive-demo/).
