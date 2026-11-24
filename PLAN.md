# Social care standards demo: build plan

A web-based, point-in-time simulation of a fictional case management system (CMS), built on synthetic data that conforms to the Social Care Interoperability Standards. Every front-end view sits beside a back-end view showing what the same data looks like according to the standard.

Written 2026-11-24 by Neil Majithia (ODI) with Claude (Opus). Implementation is handed to another model: read this whole file before planning.

---

## 1. Context

### The programme

The Social Care Interoperability Standards (Social Finance, ODI and Coram) are published at <https://standard.socialcaredata.io>. Source: <https://github.com/SocialCareData/standard>. The standards are LinkML data models, with OWL and SHACL generated from them. The ones in scope here are:

| Standard | Page | What it covers |
| --- | --- | --- |
| Person (PUB01) | `/PUB01_person_standard` | Who someone is. Two profiles: **subject of care** (strict) and **connected person** (only `name` required). |
| Safeguarding (PUB02) | `/PUB02_safeguarding_standard` | `Organisation`, `Service`, `Professional`, `ServiceEpisode` (bounded periods), `LifeEvent` (moments), plus `Finding`/`Observation`/`Measurement` and `LinkedRecord`. |
| Assessments and Plans (PUB05) | `/PUB05_assessments_and_plans_standard` | `CareNeedsAssessment` and `CarePlan`. **Adult social care only (Care Act 2014).** |
| Referrals and Requests (PUB06) | `/PUB06_referrals_standard` | `Referral` (into social care), `Request` (out of social care), `QualityOfCareConcern`, `Response`. |

**Out of scope:** the Placements standard (PUB00). Do not use it anywhere.

PUB06 is being changed in PR #110 (branch `referrals_iteration`), which will merge soon. **The demo targets the #110 versions of the schemas.** Preview of the PUB06 page: <https://pr-110.socialcaredata-standard-preview.pages.dev/PUB06_referrals_standard>. The new parts that matter here are `IntakePerson` (all Person fields optional, plus a required `isAwareOfReferral` and an optional `notes`), the `UNASSIGNED` concern code with triage assigning concerns, `QocService`, and `Response`.

### Audience and occasion

- **Who:** the non-technical stakeholder working group. A few social workers, mostly social care admin professionals, and **CMS providers**.
- **When:** a live walkthrough by Neil on **Thursday 26 November 2026**. Attendees open the same link during the session, and it stays up for them to explore over the Christmas break.
- **Last year's version** was a Miro board of pretend CMS screenshots joined by a flow diagram. This is the interactive successor.

### Key messages, in order of importance

1. **Same data, different screens.** The standard defines the data underneath. Your front end, forms and workflow stay your own. The second-system view (§5.6) makes this concrete.
2. **Records link up to tell a person's story.** Referrals, responses, requests, episodes, events, assessments and plans point at each other by identifier, across organisations.
3. **The standard is the shareable core, not the whole CMS.** The things it doesn't cover are shown greyed out, on purpose.
4. **It's honest about its gaps.** Annotations show where the standards are still open, and invite feedback.

### Hard constraints

- **Do not resemble any real CMS** (Liquidlogic/LCS/LAS, Mosaic, Eclipse, SystmOne, Azeus, etc.). There are CMS providers in the room. Use a deliberately generic, utilitarian design. The fictional product is called **"Example CMS"** and is clearly labelled as a fictional demonstration on every page.
- **Everything is fictional.** The council is **Anytown Borough Council**. No real people, organisations, CQC IDs or postcodes. Use `.example` domains for identifier systems (§4.2). Real *standard* systems such as `https://fhir.nhs.uk/Id/nhs-number` may be used as the identifier *system*, with fake values in the NHS test range (`999 xxx xxxx`).
- **Point in time.** The whole demo is a snapshot "as at **Thursday 26 November 2026**". There is no time scrubber and no animation over time. Records dated after that day must not exist.
- **Utilitarian look.** Match the feel of standard.socialcaredata.io: plain, readable, tables and definition lists, no gratuitous animation. Reuse its colour tokens (§7.4). The one place to have fun is the galaxy map (§5.7), and even that should stay restrained.
- **All synthetic data must validate** against SHACL shapes built from the vendored #110 schemas. A non-conforming record fails the build (§6).
- **British English** throughout.

---

## 2. Working rules for the implementer

**Starting point:** `C:\dev\socialcare-demo` contains only this `PLAN.md`. It isn't yet a git repository, and nothing from the standard has been copied in. The first steps are:
1. `git init`;
2. write `tools/sync_standard.py` (§6.1) and run it, which fetches the schemas from GitHub, so no local checkout of the standard is needed;
3. set up the venv;
4. get `tools/validate.py` building the shapes before writing any data.

- Everything happens in **one directory**: `C:\dev\socialcare-demo` (this repo). It is outside OneDrive on purpose, because OneDrive and Docker bind mounts have caused painfully slow builds. Don't work in the standard repo's checkout. Everything needed from it is vendored by `tools/sync_standard.py` (§6.1).
- **Never edit `vendor/`.** If the standard looks wrong or awkward, *don't work around it silently*. Record it as a gap annotation (§8) and tell Neil.
- No server-side code. The output is a static site in `site/`.
- **Ask Neil before** creating the GitHub repo, pushing for the first time, and enabling Pages. The repo is `SocialCareData/socialcare-demo`, and it must be public, because Pages needs that on the organisation's plan. That's fine, since the data is all synthetic.
- Keep the dependency footprint tiny. Vendor any JS library into `site/lib/` rather than loading it from a CDN, because council networks often block CDNs.
- LF line endings, 4-space indent (2 for Markdown and JSON), final newline. Add a `.editorconfig` and `.gitattributes` (`* text=auto eol=lf`).

---

## 3. Repository layout

```
socialcare-demo/
├── PLAN.md                     this file
├── README.md                   what it is, how to run, how to deploy
├── requirements.txt            copy of the standard's src/assets/scripts/requirements.txt
├── .github/workflows/pages.yml validate → build → deploy site/ to GitHub Pages
├── vendor/standard/            written by tools/sync_standard.py, never hand-edited
│   ├── SOURCE.txt              repo, ref and commit SHA it came from
│   ├── src/_data/model/**      LinkML schemas, contexts, imports.json (examples/ may be dropped)
│   ├── src/assets/scripts/*    build_ontology.py, build_contexts.py, validate_examples.py, …
│   └── src/_styles/_root.css, base.css
├── data/
│   ├── records/                the synthetic dataset: hand-written JSON-LD, one record per file
│   │   ├── person/subject-of-care/*.jsonld
│   │   ├── person/connected/*.jsonld
│   │   ├── safeguarding/*.jsonld          organisations, services, professionals, episodes, life events
│   │   ├── referrals/*.jsonld             referrals, requests, QoC concerns, responses
│   │   └── assessments-and-plans/*.jsonld
│   ├── external-refs.yaml      identifiers deliberately pointing at records held elsewhere (§4.3)
│   ├── annotations.yaml        gap annotations and not-standardised notes (§8)
│   └── ui.yaml                 front-end-only content: case notes, tasks, allocations (greyed out, §5.8)
├── tools/
│   ├── sync_standard.py
│   ├── validate.py             SHACL + referential integrity + date checks
│   └── build.py                writes site/data/bundle.json
└── site/
    ├── index.html
    ├── css/  js/  lib/
    └── data/bundle.json        generated, git-ignored
```

The dev loop, from the repo root only:

```bash
python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt   # once
python tools/sync_standard.py --ref referrals_iteration                             # once, and again when the standard changes
python tools/validate.py && python tools/build.py
python -m http.server -d site 8000                                                  # http://localhost:8000
```

---

## 4. The synthetic dataset

### 4.1 Format

- **One record per file**, in JSON-LD, in the folder for the standard (and profile) whose shape it must satisfy. The path decides the shape: `<standard>/<profile or "standard">-shape.ttl`, the same rule as the standard repo's `validate_examples.py`.
- `@context`: use the module context URL in the style the PUB pages use, `https://ns.socialcaredata.io/<module>/context.jsonld`. Validation swaps in the vendored local context, as `validate_examples.py` does, so the URL never needs to resolve during the build.
- `@id`: `https://anytown.example/records/<kind>/<local-id>`.
- Use `@type` and the **JSON keys exactly as the module `context.jsonld` defines them**, which are the slot *titles*, not the LinkML slot names. Keys are polymorphic per class (for example `name`, `type`, `subject`, `recipient`). When unsure, copy the shape of the examples in `vendor/standard/src/_data/model/examples/` and the PUB page examples.
- Readable, realistic free text. Descriptions and notes are written the way a teacher, police officer, district nurse or daughter would write them: short, specific and plain.

### 4.2 Identifier systems (all fictional)

| Kind | `system` | Example value |
| --- | --- | --- |
| Council person ID | `https://anytown.example/id/person` | `P-100231` |
| NHS number | `https://fhir.nhs.uk/Id/nhs-number` | `9990001234` (test range) |
| Organisation | `https://anytown.example/id/organisation` | `ORG-ABC` |
| Service | `https://anytown.example/id/service` | `SVC-CFD` |
| Professional | `https://anytown.example/id/professional` | `PRF-014` |
| Referral / request / QoC / response | `https://anytown.example/id/referral` (`/request`, `/qoc`, `/response`) | `REF-2026-0412` |
| Episode / life event | `https://anytown.example/id/episode` (`/life-event`) | `EP-2026-0088` |
| Assessment / plan | `https://anytown.example/id/assessment` (`/plan`) | `CNA-2026-0031` |
| Fictional CQC location | `https://cqc.example/location` | `1-000000001` |

Postcodes must pass the schema's postcode pattern but must not be real. Use an invented area such as `AT1 4QX`. Check the pattern in `common.yaml`.

### 4.3 Links and referential integrity

Records refer to each other only through `Identifier` objects (`system` + `value`), and through `LinkedRecord` (`recordId`, `recordType`, `recordRelationship`). The build resolves every Identifier that appears *anywhere* in a record to the record carrying that identifier. Each Identifier must either resolve, or be listed in `data/external-refs.yaml` with a short label (for example "School Mental Health Support Team referral, held by Anytown NHS Foundation Trust"). Unresolved and unlisted references fail validation. External references appear in the map as distant, dim "held elsewhere" nodes, which is a deliberate visual point: not everything sits in your system.

### 4.4 Reference data (shared across the cases)

These are the fixed points of the map. Choose codes from the vendored vocabularies (`OrganisationCode`, `ServiceCode`, `ServiceCostFrequency`). Approximately:

**Organisations:** Anytown Borough Council (`local-authority`); Anytown NHS Foundation Trust (`nhs-trust`); Anytown Constabulary (`police-force`); Anytown Primary School (`primary-school`); Northgate Academy (`high-school`); Brightwater Home Care Ltd, a fictional domiciliary care provider (closest code is `social-care.adults`, see gap G8).

**Services:** Children's Front Door / MASH (`MASH`); Children's Assessment and Intervention Team (`social-worker-support`); Early Help (`early-help`); CAMHS (`CAMHS`); School Mental Health Support Team; Adult Social Care Front Door (`adult-front-door`); Adult Safeguarding Team (`adult-safeguarding`); Brightwater home care (`home-support-domiciliary`, `hourly`); Anytown Telecare (`telecare`); District Nursing (`other-professional-support`).

**Professionals (all fictional):**
- the Anytown Primary designated safeguarding lead;
- a children's front door social worker;
- Riley's allocated social worker;
- an early help practitioner;
- a police officer;
- Jordan's social worker;
- a CAMHS clinician;
- an adult social worker (Care Act assessor);
- a district nurse;
- an adult safeguarding practitioner.

Every `Organisation` must list its `relatedService`s, which is required (`1..*`).

### 4.5 The cases

Three cases. Children's and adults' social care are separate worlds, so the cases don't share families. They meet only through the shared reference data.

Dates are guidance. Keep them coherent and on or before 26 Nov 2026. Codes are given where they exist in the vendored vocabularies; verify each one against `vendor/`.

#### Case A: Riley Hart, 9 (children's: neglect concern, CIN, CAMHS redirect)

People:
- **Riley Hart** (subject of care).
- **Mia Hart, 4**, sibling. Subject of care, but with a thin record.
- **Dawn Hart**, mother (connected person).

| Date | Record | Notes |
| --- | --- | --- |
| 2026-07-28 | `LifeEvent` `ae-attendance` (Riley) | Burn to hand. Shared by the NHS trust. Before any referral. |
| 2026-09-15 | `Referral` `child.safeguarding` | From the school safeguarding lead (`referrerType` Professional, embedded `Professional`). Subject is an `IntakePerson` for Riley with `isAwareOfReferral: true`; Dawn appears in `personalNetwork` (`MTH`) and is also aware. The school didn't classify the concern. **The stored record has `concernType: child.neglect`, assigned at triage.** The front end shows "Referrer's original: Unassigned → assigned at triage", greyed as local (see §5.8 and PUB06 guidance). Description covers repeated hunger, unwashed uniform, missed days and a late pick-up. One local `ReferralAssessmentQuestion` (`SUBJECT.VOICE_WISHES`). |
| 2026-09-16 | `Response` `acknowledged` | Responder: Children's Front Door. |
| 2026-09-16 → 09-18 | `ServiceEpisode` `assessment.MASH-review` | Linked to the referral. |
| 2026-09-18 | `Response` `accepted` | Its `linkedRecord` points on. |
| 2026-09-18 | `Request` `child.CIN` | Internal: from the front door to the Assessment and Intervention Team. `linkedRecord` → the referral, `followupTo`. |
| 2026-09-21 → 10-20 | `ServiceEpisode` `assessment.other-assessment` | The child and family (s17) assessment. There is no specific code, see gap G5. Has `finding`s: Observations `persistent-school-absences` and `free-school-meals`; a Measurement of attendance as `pct`. |
| 2026-10-27 → open | `ServiceEpisode` `plan.cin-plan` | Open, no end date. **This is where issue #115 bites** (gap G1). |
| 2026-11-03 | `Request` `child.statutoryServices` | To CAMHS: anxiety, sleep problems, school refusal. |
| 2026-11-05 | `Response` `acknowledged` | From CAMHS. |
| 2026-11-17 | `Response` `redirected` | From CAMHS. Description: doesn't meet the specialist threshold, passed to the School Mental Health Support Team. `attachment` is the outcome letter (a `DocumentReference` with a fake URL). `linkedRecord` points to the MHST referral, which is an **external ref**. |

#### Case B: Jordan Pike, 15 (children's: missing episodes, extra-familial harm, escalation to s47)

People:
- **Jordan Pike** (subject of care).
- **Carla Pike**, mother (connected person).

| Date | Record | Notes |
| --- | --- | --- |
| 2026-06 → open | `ServiceEpisode` `plan.other-plan` (Early Help plan) | Early Help Service, early help practitioner. |
| 2026-09-02, 10-11, 11-07 | 3 × `LifeEvent` `missing-person` | Related service: police. Each has its own `Timing`; the 11-07 one is overnight. |
| 2026-11-08 | `Referral` `child.safeguarding` | From the police officer, after the third missing episode. Concern `child.extrafamilialHarm`, chosen by the referrer. Description: found in another town with older males, new phone, cash. `IntakePerson` Jordan `isAwareOfReferral: true`; Carla in `personalNetwork`, aware. |
| 2026-11-09 | `Response` `acknowledged` | |
| 2026-11-10 | `Request` `child.s47` | Front door to the Assessment and Intervention Team. `linkedRecord` → the police referral (`followupTo`), plus an attempted `escalationOf` link to the Early Help plan episode, which **can't be expressed** (gap G2). |
| 2026-11-11 → open | `ServiceEpisode` `assessment.section-47` | Has a finding with Observation `persistent-school-absences`. |

#### Case C: Margaret Ellis, 82 (adults: Care Act assessment, care plan, safeguarding and a quality-of-care concern)

People:
- **Margaret Ellis** (subject of care). Lives alone; Parkinson's disease.
- **Sarah Grant**, her daughter and unpaid carer (connected person, `relatedPerson` `DAU`).

| Date | Record | Notes |
| --- | --- | --- |
| 2026-07-20 | `LifeEvent` `ae-attendance` | A fall at home. |
| 2026-08-04 | `Referral` `adult.careActAssessment` | From Sarah (`referrerType` FamilyMember, with the referrer as a `Person`). Margaret `isAwareOfReferral: true`. **A concern is required, but the taxonomy is about abuse and neglect**, so it's recorded as `adult.other` with a description ("struggling to manage at home since her fall"). See gap G3. |
| 2026-08-05 | `Response` `accepted` | Adult Front Door. |
| 2026-08-11 → 08-25 | `ServiceEpisode` `assessment.care-act-assessment` | Findings: Observations `has-unpaid-carer`, `risk.falling`, `support-reason.physical-personal-care`. |
| 2026-08-25 | `CareNeedsAssessment` | `serviceEpisodeId` → the above. Statutory questions with national IDs: `STAT-HOUSING-01` (lives alone: yes), `STAT-HEALTH-01`, `CA-NUTRITION-01`, `CA-HYGIENE-01`, `CA-TOILET-01`, `CA-HOMESAFETY-01`, `CA-ELIGIBILITY-01`. Plus one **local** question with no national ID: a "Pen picture: what matters to Margaret". `planId` → the plan; `consentToInformationSharing: true`; `status` `completed`. |
| 2026-09-01 → open | `ServiceEpisode` `plan.care-plan` | |
| 2026-09-01 | `CarePlan` | `assessmentId` → the CNA; `status` `active`. `careComponent`s: (1) Brightwater home care, 4 visits a day, outcomes `CA-HYGIENE`/`CA-TOILET`/`CA-NUTRITION`, *including help to take medication at each visit*; (2) Sarah (Family), Sundays, `CA-RELATIONSHIPS`; (3) Telecare pendant (Professional services), `CA-HOMESAFETY`. Each has a FHIR-style `Timing.frequency`. |
| 2026-09-03 → open | `ServiceEpisode` `provision.direct-provision` | Brightwater home care visits. `relatedService` → Brightwater; `Timing` with frequency. |
| 2026-11-24 | `Referral` `adult.safeguarding` | From the **district nurse**: a grade 2 pressure ulcer on her sacrum; the medication record shows evening Parkinson's medication missed on 6 of the last 14 days; visit logs show late and missed evening calls; Margaret had another fall. Concern `adult.neglect`, chosen by the referrer. Margaret `isAwareOfReferral: true`; Sarah in `personalNetwork`, aware. |
| 2026-11-25 | `QualityOfCareConcern` | From Sarah. `recipient` = Anytown council **and** CQC (fictional CQC org identifier). `service` = `QocService` for Brightwater with the fictional CQC location ID. **Concern `UNASSIGNED`**: it arrived yesterday and hasn't been triaged yet. Her description, in her own words: missed teatime visits, Mum's tablets left in the blister pack, carers rushing, different faces every day. `linkedRecord` → the safeguarding referral, `concurrentWith`. |
| 2026-11-25 | `Response` `acknowledged` | For the safeguarding referral. |
| 2026-11-25 | `Request` `adult.s42Enquiry` | Front door to the Adult Safeguarding Team. `linkedRecord` → the referral, `followupTo`. |
| 2026-11-26 | `ServiceEpisode` `assessment.adult-safeguarding` | Opened today. |

Expect around **70 records**: about 7 people, 6 organisations, 10 services, 10 professionals and about 37 case records. Don't pad it: every record should be part of the story.

### 4.6 Invariants to check (in `tools/validate.py`)

- Every record conforms to its shape.
- Every Identifier resolves or is in `external-refs.yaml`.
- No date is after 2026-11-26.
- No `Referral` concern is still `UNASSIGNED` *except* where §4.5 says it should be. Only Margaret's QoC concern is still awaiting triage.
- Every `@id` and identifier is unique.

---

## 5. The application

### 5.1 Layout

There are two panes side by side on desktop, stacked on narrow screens (they must work at phone width).

- **Left: front end.** What the fictional "Example CMS" shows.
- **Right: back end.** The same data according to the standard. It is always visible, with tabs:
  - **Data**: the raw JSON-LD, syntax-highlighted.
  - **Explained**: a table of `field | value | meaning`. Codes are shown with their vocabulary label. Each field names its standard and links to that field's anchor on the standard site.
  - **Map**: the galaxy map (§5.7).

There is a persistent banner: "Example CMS: a fictional demonstration. All people, organisations and records are synthetic." It shows the snapshot date ("As at Thursday 26 November 2026") and a small badge, "✓ N records valid against the standards (built from <commit>)", which links to an About page.

Use hash routing (`#/person/P-100231`, `#/record/<kind>/<id>`, `#/map`, `#/system/camhs`, `#/gaps`, `#/about`) so the site works on GitHub Pages and the back button works.

### 5.2 Connecting front end to back end (approach still open)

The demo depends on people *seeing* that a value on the CMS screen and a value in the standard's data are the same thing. **How to show that is still undecided.** Neil isn't convinced by the first idea, so propose options with trade-offs in your plan and let him choose.

- **First idea: hover-linking.** Every rendered value on the left carries a `data-path` (a JSON pointer into its record). Hovering or focusing it highlights the matching key and value in the Data and Explained tabs, and the reverse.
  - Concerns: it's invisible until you hover, it doesn't come across when projected in a live walkthrough, and it doesn't work on touch screens.
- **Alternatives to consider:**
  - numbered callouts or pins shared by both panes;
  - a toggle that overlays field names on the front end;
  - an Explained tab ordered to mirror the screen's layout;
  - clicking a section on the left to scroll and outline its part of the JSON;
  - something better.

Whatever is chosen must work keyboard-only and when projected.

### 5.3 Home: front door and caseload

- **Front door queue:** incoming referrals and concerns, newest first, with a status derived from Responses. Margaret's QoC concern shows a visible "Concern type: Unassigned, awaiting triage" flag.
- **People:** a list of the subjects of care, with age, open episodes and allocated worker (the last is greyed, see §5.8).
- With nothing selected, the right pane defaults to **Map** for the whole dataset.

### 5.4 Person record

- **Header:** name, date of birth (with accuracy indicator), age, identifiers (council ID, NHS number), address, gender, ethnicity, communication needs. Everything shown here is from the Person standard.
- **Relationships:** connected people and their relationship codes, linked to their own (thin) records.
- **Involved professionals and services:** derived from episodes, events and requests.
- **Chronology:** every record concerning the person, sorted by date. A coloured tag shows the kind (referral, response, request, episode, life event, assessment, plan, concern), with a one-line summary. Rows can be filtered by kind. Interleave greyed rows for things the standard doesn't cover, such as case notes and home visits, to show where a real chronology goes further (gap G4).
- The right pane shows this person's JSON-LD and, in Map, their part of the network.

### 5.5 Record views (one renderer per type)

Each looks like a plausible read-only CMS screen, not a JSON dump. Each also shows its links ("Responds to", "Follow-up to", "Linked records") as navigable chips.

- **Referral:** read like a submitted form. Referrer, subject(s) (handle the `IntakePerson` partial-information display, e.g. "Name not known"), personal network, awareness flags, concern(s) with type and description, local questions grouped by category, attachments, responses received.
- **Request:** to whom, purpose (label from the vocabulary), subject and referrer resolved to names, responses.
- **QualityOfCareConcern:** recipients, the service it's about, concerns (the Unassigned triage flag), anonymity-friendly display.
- **Response:** status, responder, date received, description, attachment, onward links.
- **ServiceEpisode:** type, period, subjects with involvement codes, professionals, services, findings, outcome, linked records.
- **LifeEvent:** type, when, where, who.
- **CareNeedsAssessment:** questions grouped by category, statutory ones badged with their national `questionId`, the local question visibly unbadged. Capacity, advocate and consent flags.
- **CarePlan:** a who / when / what table of care components. Frequency rendered in plain English ("4 times a day", "Sundays").
- **Organisation / Service / Professional:** simple directory cards.

### 5.6 Second system: "Anytown CAMHS: incoming requests" (must for Thursday)

A deliberately *different-looking* screen: a different layout, accent colour and terminology, as if it were another supplier's product, still fictional and generic. It lists Riley's Request as it arrived at CAMHS, plus the Response CAMHS sent back. The right pane shows **the identical JSON-LD** to the council's view of the same Request, with a callout: "Same record, different system. Only the screen differs." Provide a toggle or link to jump between the two systems' views of the same record.

Christmas stretch: a second one, "CQC: concerns received", showing Margaret's QoC concern.

### 5.7 Galaxy map

This is inspired by the galaxy map in *Elite: Dangerous*, but in 2D and restrained.

- d3-force (vendored d3 v7) on a dark, star-field-ish canvas or SVG, contained inside the right pane, with a full-screen route at `#/map`.
- **Nodes** are records. Colour by standard (Person / Safeguarding / Assessments and Plans / Referrals); shape or size by kind. People are the large "stars". Reference data (organisations, services, professionals) are smaller fixed points. External references are dim nodes at the edge, labelled "held elsewhere".
- **Edges** are resolved Identifier references, labelled on hover with the property (`subject`, `respondsTo`, `serviceEpisodeId` …). `LinkedRecord` edges are labelled with their relationship (`followupTo`, `escalationOf`, `concurrentWith`).
- Clicking a node opens that record on the left and centres it. Hovering shows a tooltip with the kind, title and date.
- Scope selector: whole dataset / this person / this record and its neighbours. Avoid a hairball. In the whole-dataset view, reference-data nodes can be toggled off.
- Accessibility: the map is supplementary. Every link it shows is also reachable as a link on the left. Respect `prefers-reduced-motion` by settling the simulation before first paint.

### 5.8 Not standardised: greyed out

Things a real CMS shows but the standards don't define are rendered greyed out (muted colour, dashed border) with a small "Not part of the standard: local to your system" label. The content comes from `data/ui.yaml`, never from the JSON-LD. Examples:
- allocated worker and team;
- case notes;
- tasks and deadlines;
- workflow states such as "awaiting manager sign-off";
- RAG ratings and risk flags;
- the referrer's original concern type before triage;
- "last viewed by".

This was a theme of last year's board too.

### 5.9 Gaps page and inline annotations

Inline: a small, distinctive marker (e.g. "◆ Open question") next to the relevant UI element. Expanding it shows the explanation, what we'd like feedback on, and a link to the GitHub issue if one exists. `#/gaps` lists all of them. Content comes from `data/annotations.yaml` (§8).

### 5.10 About page

What this is, who made it, the snapshot date, which standard versions and commit it was built from, links to each standard, and **how to give feedback**: an email address (DataStandards-SocialCare@socialfinance.org.uk) and a link to GitHub issues. Neil may add a demo-specific issue template to the standard repo; if he does, link to it.

---

## 6. Tooling

### 6.1 `tools/sync_standard.py`

- Args: `--ref` (default `referrals_iteration`; switch to `main` once PR #110 merges) and `--repo` (default `https://github.com/SocialCareData/standard.git`).
- Sparse, shallow clone into a temporary directory: `src/_data/model`, `src/assets/scripts`, `src/_styles`.
- Replace `vendor/standard/`, **preserving the `src/…` layout**, because the vendored scripts find the repo root as `Path(__file__).parents[3]`.
- Write `vendor/standard/SOURCE.txt` with the repo, ref, full SHA and date.
- Commit the vendored copy, so CI and anyone cloning don't need network access to the standard repo.

### 6.2 `tools/validate.py`

- Put `vendor/standard/src/assets/scripts` on `sys.path`. Build the shapes with `build_ontology.build(tmpdir)`. Reuse `validate_examples.py`'s approach: swap in the local module context with `load_example`/`module_context`, then run pyshacl with `inference="none"`. Read `vendor/standard/src/assets/scripts/validate_examples.py` first; import its helpers where that's clean.
- Map `data/records/<standard>[/<profile>]/` to `<standard>/<standard>-<profile or "standard">-shape.ttl`.
- Run the §4.6 invariants. Print readable violations, exit non-zero on any failure, and write `site/data/validation.json` (counts, commit, timestamp) for the badge.

### 6.3 `tools/build.py`

Writes `site/data/bundle.json` containing:
- all records (raw JSON-LD, as written), keyed by `@id`;
- an identifier index (`system|value` → `@id`);
- resolved edges (`from`, `to`, `property`, `relationship?`);
- vocabulary labels for every code used: `{enum: {code: {title, description}}}`, extracted from the vendored LinkML YAML;
- for each field, the standard and anchor URL used by the Explained tab;
- external refs, annotations and UI-only content.

The front end does no RDF processing. It reads this bundle only.

### 6.4 CI and deployment

`.github/workflows/pages.yml`: on push to `main`, set up Python, `pip install -r requirements.txt`, run `tools/validate.py` and `tools/build.py`, upload `site/` and deploy with `actions/deploy-pages`. The URL will be `https://socialcaredata.github.io/socialcare-demo/`. All asset paths must be relative so the subpath works. A custom domain such as `demo.socialcaredata.io` is a later decision for Neil.

---

## 7. Front-end technical notes

### 7.1 Stack

Plain HTML, CSS and ES modules, with no framework and no bundler. Vendored d3 v7 (only what the force layout needs), and a tiny JSON syntax highlighter written by hand. There is no build step for JS.

### 7.2 Performance

About 70 records means nothing to optimise. Load one `bundle.json`.

### 7.3 Accessibility

Semantic HTML, visible focus, colour never the only signal (tags have text), AA contrast in both panes, keyboard navigation for record links and the field-linking highlights.

### 7.4 Styling

Start from the vendored `_root.css` tokens:
- `--background` (dark teal) for the banner and header;
- `--main-text-*` for content;
- `--highlight-1…4` for annotation and status boxes;
- `--main-tag-*` for kind tags;
- `--link-*`.

The CAMHS second system uses a *different* accent colour and layout on purpose. The map pane may use a near-black background. Keep everything else plain.

---

## 8. Gap annotations (`data/annotations.yaml`)

Each entry has: `id`, `title`, `where` (route and element), `body` (2–4 plain-English sentences for a non-technical reader), `question` (what we want feedback on), and an optional `issue` URL. Starting list:

| ID | Where | Gap |
| --- | --- | --- |
| G1 | Riley's CIN plan episode; chronology | **Issue #115** (<https://github.com/SocialCareData/standard/issues/115>). In social work and CMSs, a "service episode" usually means the overarching period of a status (e.g. "Child in Need from 27 Oct"). Our `ServiceEpisode` is broader, and its types (assessment / plan / provision / request) describe the activities within it. Show both readings. Ask: which matches how you record it? |
| G2 | Jordan's s47 Request | `LinkedRecord.recordType` can't point to a `ServiceEpisode` or `LifeEvent`: it covers only referral, request, QoC concern, response, assessment and plan. So "this s47 is an escalation of the Early Help plan" can't be linked. PUB06's `Response` text also suggests linking to "the service episode the responder opened". |
| G3 | Margaret's first referral | `Referral.concern` is required, but its taxonomy is about abuse and neglect. A request for a Care Act assessment has to use `adult.other`. Should non-safeguarding referrals have a different concern list, or none? |
| G4 | Person chronology | Real chronologies include case notes, visits and phone calls. The standards have no general "chronology entry" or contact record. Is that needed for sharing, or local only? |
| G5 | Riley's s17 assessment episode | No episode code for the s17 Child and Family Assessment, so `assessment.other-assessment` is used. |
| G6 | Children's episodes | `ServiceEpisode.outcome` uses an adult social care vocabulary (from Client Level Data). There are no children's outcomes. |
| G7 | Case A/B record views | Assessments and Plans are adult-only (Care Act). Children's assessments and plans (s17, CIN plan, CP plan) exist only as episode *types*, with no content. |
| G8 | Brightwater organisation card | `OrganisationCode` has no "care provider" type; `social-care.adults` is the closest. |
| G9 | Referral subjects (IntakePerson) | How does an `IntakePerson` (partial details given at referral) become a full subject-of-care `Person` record? Matching and promotion are not described. |
| G10 | Referral view, involvement section | Parked from the PR #110 work: recording whether *professionals* already involved know about the referral (restructuring `ReferralInvolvement`). |
| G11 | Margaret's CNA, any `Enum` answer | Parked: an `answerVocabulary` field so an `Enum` answer can name the code list it uses. |

The implementer should **add** to this list when building the data exposes something awkward, and tell Neil about each addition. Don't change the data model to fix anything.

---

## 9. Priorities

### Thursday 26 Nov (live walkthrough; must also be usable by attendees)

1. Vendoring, validation and build pipeline working; all records valid.
2. The complete dataset for cases A, B and C.
3. Home, person record with chronology, and record views for every type.
4. Back-end pane with the Data and Explained tabs, and the front-to-back connection agreed with Neil (§5.2).
5. CAMHS second-system view.
6. Galaxy map: basic but working (whole / person / record scopes, click to navigate).
7. Greyed not-standardised elements; inline gap markers and the gaps page; About page.
8. Deployed to GitHub Pages, after Neil approves the repo and push.

If time runs short, cut in this order: map polish → reference-data toggles → filters on the chronology → Explained-tab anchor links. **Never cut** validation, the front-to-back connection (§5.2) or the second-system view.

### Christmas release (after the session)

- CQC second-system view.
- Accessibility and copy review.
- More annotations from the session's feedback.
- A link from standard.socialcaredata.io (a small PR to the standard repo after #110 merges).
- Possibly a custom domain.

---

## 10. Walkthrough script (for Neil, about 10 minutes)

1. **Home.** "This is a fictional CMS, and on the right is what the standard sees." The front door queue shows the QoC concern that hasn't been triaged.
2. **Riley → school referral.** Show how the concern on screen corresponds to its JSON (using the §5.2 approach). "Unassigned → neglect at triage." Point to the greyed "original type", which is local.
3. **Riley's chronology.** Referral → responses → MASH review → CIN request → assessment → CIN plan. Open the **G1** marker (#115).
4. **CAMHS request.** Switch to the CAMHS system view: "Same JSON, different screen." Then the redirected Response and the "held elsewhere" MHST node in the map.
5. **Jordan.** Three missing episodes → police referral → s47 escalation. Open **G2**.
6. **Margaret.** The Care Act assessment (statutory question IDs beside the local pen-picture question) → care plan who / when / what → the district nurse's safeguarding referral → Sarah's QoC concern, linked `concurrentWith`, still Unassigned.
7. **Map, whole dataset.** "Every line is an identifier pointing at another record, across organisations."
8. **Gaps page.** "This is what we want your help with over Christmas."
