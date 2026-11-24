// Page-level views: welcome, people (the CMS home), directory, person and timeline, CAMHS second system, gaps, about.

import {
    h, frag, fielder, fmtDate, fmtDateTime, fmtLong, age, tag, recLink, identLink, notStd, gapMarker, card, fields,
    sortByDate, SNAPSHOT,
} from "./ui.js";
import {
    allRecords, rec, resolve, title, recDate, recEnd, responsesTo, enumLabel, uiPerson, uiRecord, annotations,
    asList, personName, formalName, councilId, nhsNumber, recordsAboutPerson, peopleFor, edgesFrom, edgesTo,
    KIND_LABEL, store, route, REFERENCE_KINDS,
} from "./store.js";
import { formatNhs, systemSwitch } from "./records.js";

// ------------------------------------------------------------------ summaries

function nameOf(ident) {
    const res = resolve(ident);
    if (!res) return ident ? ident.value : "";
    return res.record ? title(res.record) : res.external.label;
}

export function summary(r) {
    const d = r.data;
    switch (r.kind) {
        case "referral": {
            const from = d.referrer && (d.referrer.professional ? formalName([d.referrer.professional.name])
                : d.referrer.professionalId ? nameOf(d.referrer.professionalId)
                    : d.referrer.person ? personName(d.referrer.person.name) : "");
            const concerns = asList(d.concern).map((c) => enumLabel("ConcernCode", c.concernType)).join(", ");
            return `${enumLabel("ReferralTypeCode", d.type)} referral from ${from || "unknown"}: ${concerns}`;
        }
        case "qoc":
            return `Quality-of-care concern about ${d.service && d.service.name}, concern type ${asList(d.concern).map((c) => enumLabel("QocConcernCode", c.concernType)).join(", ")}`;
        case "request":
            return `Request to ${asList(d.recipient).map(nameOf).join(", ")}: ${enumLabel("RequestPurposeCode", d.purpose)}`;
        case "response":
            return `${enumLabel("ResponseStatusCode", d.status)} by ${nameOf(d.responder)}`;
        case "episode": {
            const end = recEnd(r);
            return `${asList(d.type).map((t) => enumLabel("EpisodeCode", t)).join(", ")} (${end ? `to ${fmtDate(end)}` : "open"})`;
        }
        case "life-event":
            return `${asList(d.type).map((t) => enumLabel("EventCode", t)).join(", ")}${d.location ? `, ${asList(d.location)[0]}` : ""}`;
        case "assessment":
            return `Care needs assessment (${enumLabel("DocumentStatus", d.status)}) by ${nameOf(d.professionalId)}`;
        case "plan":
            return `Care and support plan (${enumLabel("DocumentStatus", d.status)}), ${asList(d.careComponent).length} parts`;
        default:
            return title(r);
    }
}

// ------------------------------------------------------------------ people (the CMS home)

function openEpisodes(p) {
    return sortByDate(recordsAboutPerson(p.id).filter((r) => r.kind === "episode" && !recEnd(r)), recDate);
}

/** "Mother of Riley Hart": how a connected person relates to the subjects of care who list them. */
function connectedTo(c) {
    const out = [];
    for (const e of edgesTo(c.id)) {
        const from = rec(e.from);
        if (!from || from.kind !== "person" || from.profile !== "subject-of-care") continue;
        for (const rp of asList(from.data.relatedPerson)) {
            const res = resolve(rp.identifier);
            if (res && res.record && res.record.id === c.id) {
                out.push(h("span", asList(rp.relationship).map((code) => enumLabel("PersonRelationshipCode", code)).join(", "),
                    " of ", recLink(from, null, { noTag: true })));
            }
        }
    }
    return out;
}

export function peopleView() {
    // People with a timeline first, then youngest first: Riley, Jordan, Margaret, then Mia.
    const dobOf = (r) => (r.data.dateOfBirth && r.data.dateOfBirth.date) || "";
    const people = allRecords().filter((r) => r.kind === "person" && r.profile === "subject-of-care")
        .sort((a, b) => (recordsAboutPerson(b.id).length > 0) - (recordsAboutPerson(a.id).length > 0)
            || dobOf(b).localeCompare(dobOf(a)));
    const connected = allRecords().filter((r) => r.kind === "person" && r.profile === "connected")
        .sort((a, b) => title(a).localeCompare(title(b)));

    return frag(
        h("div.page-head",
            h("h1", "People"),
            h("p", `The people Anytown Borough Council is supporting, as at ${fmtLong(SNAPSHOT)}. Open a person to see their record, and everything that has happened to them in order.`)),
        h("ul.people-list", people.map((p) => {
            const d = p.data;
            const dob = d.dateOfBirth && d.dateOfBirth.date;
            const addr = asList(d.address)[0];
            const open = openEpisodes(p);
            const latest = sortByDate(recordsAboutPerson(p.id).filter((r) => !open.includes(r)), recDate, true)[0];
            const family = asList(d.relatedPerson).map((rp) => {
                const res = resolve(rp.identifier);
                return res && res.record ? h("span", recLink(res.record, null, { noTag: true }),
                    h("span.muted", `(${asList(rp.relationship).map((c) => enumLabel("PersonRelationshipCode", c).toLowerCase()).join(", ")})`)) : null;
            }).filter(Boolean);
            return h("li",
                h("h2", h("a", { href: route(p) }, title(p)), h("span.age", `age ${age(dob)}`)),
                h("p.facts",
                    `Born ${fmtDate(dob)}. NHS number ${formatNhs(nhsNumber(p))}.`,
                    addr ? ` ${addr.line1}, ${addr.city}.` : ""),
                open.length ? h("p", h("span.muted", "Open now: "),
                    open.map((e, i) => h("span", i ? "; " : "", h("a", { href: route(e) }, enumLabel("EpisodeCode", asList(e.data.type)[0])),
                        ` since ${fmtDate(recDate(e))}`))) : null,
                family.length ? h("p", h("span.muted", "Family: "), family) : null,
                latest ? h("p", h("span.muted", "Latest: "), h("a", { href: route(latest) }, summary(latest)), `, ${fmtDate(recDate(latest))}`) : null,
                null);
        })),
        h("section.sec",
            h("h2", "Family and other connected people"),
            h("p.muted", "Connected people have thinner records: the standard needs only a name."),
            h("ul.links-list", connected.map((c) => h("li", recLink(c, null, { noTag: true }), h("span.muted", " "), connectedTo(c))))),
        h("p", "Services, professionals and organisations are in the ", h("a", { href: "#/directory" }, "directory"), "."));
}

// ------------------------------------------------------------------ directory

export function directoryView() {
    const of = (kind) => allRecords().filter((r) => r.kind === kind).sort((a, b) => title(a).localeCompare(title(b)));
    const partOf = (r) => asList(r.data.relatedOrganisation).map((x) => h("div", identLink(x, { noTag: true })));
    const dirGaps = annotations().filter((a) => asList(a.views).includes("directory"));
    return frag(
        h("div.page-head",
            h("h1", "Directory"),
            h("p", "The services, professionals and organisations that appear in people's records. Records point at these by identifier, so each one is written down once.")),
        card("Services",
            h("div.table-wrap", h("table.list",
                h("thead", h("tr", h("th", "Service"), h("th", "Type"), h("th", "Part of"))),
                h("tbody", of("service").map((r) => h("tr",
                    h("td", h("a", { href: route(r) }, r.data.name)),
                    h("td", asList(r.data.type).map((t) => enumLabel("ServiceCode", t)).join(", ")),
                    h("td", partOf(r).length ? partOf(r) : h("span.muted", "No organisation"))))))),
            dirGaps.map((a) => gapMarker(a))),
        card("Professionals",
            h("div.table-wrap", h("table.list",
                h("thead", h("tr", h("th", "Name"), h("th", "Role"), h("th", "Service"))),
                h("tbody", of("professional").map((r) => h("tr",
                    h("td", h("a", { href: route(r) }, title(r))),
                    h("td", asList(r.data.role).join(", ")),
                    h("td", asList(r.data.relatedService).map((x) => h("div", identLink(x, { noTag: true })))))))))),
        card("Organisations",
            h("div.table-wrap", h("table.list",
                h("thead", h("tr", h("th", "Organisation"), h("th", "Type"))),
                h("tbody", of("organisation").map((r) => h("tr",
                    h("td", h("a", { href: route(r) }, r.data.name)),
                    h("td", asList(r.data.type).map((t) => enumLabel("OrganisationCode", t)).join(", ")))))))));
}

// ------------------------------------------------------------------ person

export function personView(p) {
    const f = fielder(p);
    const d = p.data;
    const cid = councilId(p);
    const local = uiPerson(cid) || {};
    const dob = d.dateOfBirth && d.dateOfBirth.date;
    const isSubject = p.profile === "subject-of-care";
    const records = isSubject ? recordsAboutPerson(p.id) : [];
    const first = (personName(d.name) || "").split(" ")[0];

    const rels = asList(d.relatedPerson).map((rp, i) => h("li",
        f.v(`/relatedPerson/${i}/identifier`, identLink(rp.identifier), { key: "identifier" }), " ",
        asList(rp.relationship).map((c, j) => f.v(`/relatedPerson/${i}/relationship/${j}`, h("span.small.muted", enumLabel("PersonRelationshipCode", c)), { code: true }))));

    // Involved professionals and services, worked out from the person's records.
    const involved = new Map();
    for (const r of records) {
        for (const e of edgesFrom(r.id)) {
            const t = rec(e.to);
            if (!t || !["professional", "service", "organisation"].includes(t.kind)) continue;
            if (!involved.has(t.id)) involved.set(t.id, { r: t });
        }
    }

    const ids = asList(d.identifier).map((id, i) => h("span", i ? " " : "",
        f.v(`/identifier/${i}/value`, id.system.includes("nhs-number") ? `NHS number ${formatNhs(id.value)}.` : `Council ID ${id.value}.`)));

    return frag(
        h("div.cms-head",
            h("div.crumbs", h("a", { href: "#/people" }, "People"), " › ", isSubject ? "Record" : "Connected person"),
            h("div",
                h("h1", tag("person"), f.v("/name/0", personName(d.name))),
                h("div.sub",
                    dob ? h("span", "Born ", f.v("/dateOfBirth/date", fmtDate(dob)), ` (age ${age(dob)}). `) : null,
                    ids))),
        h("div.grid-2",
            card(isSubject ? `About ${first}` : "Personal details", fields([
                ["Full name", f.v("/name/0", formalName(d.name))],
                ["Date of birth", dob ? h("span", f.v("/dateOfBirth/date", fmtDate(dob)), " ",
                    f.v("/dateOfBirth/accuracyIndicator", h("span.small.muted", accuracy(d.dateOfBirth.accuracyIndicator)), { code: true })) : null],
                ["Gender", d.genderCode ? f.v("/genderCode", enumLabel("GenderCode", d.genderCode), { code: true }) : null],
                ["Ethnicity", d.ethnicityCode ? f.v("/ethnicityCode", enumLabel("EthnicityCode", d.ethnicityCode), { code: true }) : null],
                ["Address", asList(d.address).map((a, i) => f.v(`/address/${i}`, [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(", "), { block: true }))],
                ["Contact", asList(d.contact).map((c, i) => f.v(`/contact/${i}`, [c.name, ...asList(c.telephone), ...asList(c.email)].filter(Boolean).join(", "), { block: true }))],
                ["Communication needs", asList(d.communication).map((c, i) => f.v(`/communication/${i}/specialCommunicationNeeds`, c.specialCommunicationNeeds, { block: true }))],
                ["Deceased", d.isDeceased !== undefined ? f.v("/isDeceased", d.isDeceased ? "Yes" : "No") : null],
            ]), isSubject ? null : h("p.small.muted", "A connected person: the standard needs only a name.")),
            h("div",
                card("Family and relationships", rels.length ? h("ul.links-list", rels) : h("p.muted", "None recorded.")),
                isSubject ? card("Professionals and services involved",
                    involved.size ? h("ul.links-list", [...involved.values()].map((x) => h("li", recLink(x.r))))
                        : h("p.muted", "None."),
                    h("p.small.muted", "Worked out from the records in the timeline, not stored on the person.")) : null,
                null)),
        isSubject ? timeline(p, records, local) : null);
}

function accuracy(code) {
    if (!code) return "";
    const word = { A: "accurate", E: "estimated", U: "unknown" };
    return `(day ${word[code[0]]}, month ${word[code[1]]}, year ${word[code[2]]})`;
}

const FILTER_KINDS = ["referral", "qoc", "response", "request", "episode", "life-event", "assessment", "plan", "local"];
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

/** A flag beside referrals and concerns that still need something doing. */
function intakeStatus(r) {
    if (r.kind !== "referral" && r.kind !== "qoc" && r.kind !== "request") return null;
    if (asList(r.data.concern).some((c) => c.concernType === "UNASSIGNED")) return h("span.flag.warn", "Concern type unassigned: awaiting triage");
    if (!responsesTo(r).length) return h("span.flag.neutral", "No response yet");
    return null;
}

function timeline(p, records, local) {
    const rows = records.map((r) => ({ date: recDate(r), kind: r.kind, r }));
    for (const n of asList(local.notes)) rows.push({ date: String(n.date), kind: "local", note: n });
    rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const present = FILTER_KINDS.filter((k) => rows.some((x) => x.kind === k));
    const active = new Set(present);

    const list = h("div.timeline");
    function draw() {
        const out = [];
        let month = null;
        for (const x of rows.filter((y) => active.has(y.kind))) {
            const d = x.date && x.date.length === 10 ? new Date(`${x.date}T12:00:00Z`) : new Date(x.date);
            const m = MONTH.format(d);
            if (m !== month) {
                out.push(h("h3.t-month", m));
                month = m;
            }
            if (x.note) {
                out.push(h("div.t-item.local",
                    h("div.t-date", DAY.format(d)),
                    h("div.t-body",
                        h("div", tag("local", x.note.type), " ", h("span", x.note.text)),
                        h("div.t-meta", `${x.note.by}. Local to your system, not in the standard.`))));
            } else {
                const status = intakeStatus(x.r);
                const gaps = annotations().filter((a) => asList(a.views).includes("chronology") && asList(a.records).includes(x.r.id));
                out.push(h(`div.t-item.k-${x.kind}`,
                    h("div.t-date", DAY.format(d)),
                    h("div.t-body",
                        h("div", tag(x.kind), " ", h("a", { href: route(x.r) }, summary(x.r))),
                        status ? h("div.t-meta", status) : null,
                        gaps.map((a) => gapMarker(a, { inline: true })))));
            }
        }
        list.replaceChildren(...out);
    }
    const filters = h("div.filters", { role: "group", "aria-label": "Show in the timeline" },
        present.map((k) => h("button", {
            "aria-pressed": "true",
            onclick: (ev) => {
                const on = ev.currentTarget.getAttribute("aria-pressed") === "true";
                ev.currentTarget.setAttribute("aria-pressed", String(!on));
                if (on) active.delete(k); else active.add(k);
                draw();
            },
        }, KIND_LABEL[k])));
    draw();
    return h("section.sec.timeline-sec",
        h("h2", "Timeline"),
        h("div.body",
            h("p.muted", "Everything that has happened, oldest first. Each entry is a record, from the council or a partner, that points to this person: open one to see how it was recorded. Grey entries are the council's own notes, which the standards don't cover."),
            filters,
            list,
            annotations().filter((a) => asList(a.views).includes("chronology") && !asList(a.records).length).map((a) => gapMarker(a))));
}

// ------------------------------------------------------------------ second system: Anytown CAMHS

function camhsRequests() {
    return sortByDate(allRecords().filter((r) => r.kind === "request" && asList(r.data.recipient).some((x) => x.value === "SVC-CAMHS")), recDate, true);
}

function camhsShell(main) {
    const n = camhsRequests().length;
    return h("div.theme-camhs",
        h("div.camhs-shell",
            h("div.camhs-bar", h("strong", "Anytown CAMHS Referral Management"), h("span", "Signed in: Dr P. Nair, Intake clinician")),
            h("div.camhs-body",
                h("nav.camhs-side", { "aria-label": "CAMHS system menu" },
                    h("ul",
                        h("li", h("a", { href: "#/system/camhs" }, `Incoming referrals (${n})`)),
                        h("li.muted", "Triage meeting"),
                        h("li.muted", "Waiting list"),
                        h("li.muted", "Outcome letters")),
                    h("p.small", { style: "margin-top:1rem" }, "A second, fictional system, made by a different supplier. It reads the same standard records.")),
                h("div.camhs-main", main))));
}

export function camhsListView() {
    const list = camhsRequests();
    return camhsShell(frag(
        h("h2", "Incoming referrals"),
        h("p", { style: "font-family:var(--font)" }, "Requests received from partner agencies. Select one to triage."),
        list.map((r) => {
            const subj = resolve(r.data.subject);
            const person = subj && subj.record;
            const responses = responsesTo(r);
            const last = responses[responses.length - 1];
            return h("div.tile",
                h("a", { href: `#/system/camhs/${r.localId}` }, person ? `${title(person)}` : r.data.subject.value),
                h("div", { style: "font-family:var(--font);font-size:.9rem" },
                    `NHS ${formatNhs(r.data.subject.value)}, received ${fmtDate(r.data.dateCompleted)} from ${nameOf(r.data.referrer)}, Anytown Borough Council `,
                    last ? h("span.pill", enumLabel("ResponseStatusCode", last.data.status)) : h("span.pill.soft", "New")));
        })));
}

export function camhsDetailView(r) {
    const f = fielder(r);
    const d = r.data;
    const subj = resolve(d.subject);
    const person = subj && subj.record;
    const dob = person && person.data.dateOfBirth && person.data.dateOfBirth.date;
    const reasons = asList(d.assessmentQuestion);
    const responses = responsesTo(r);
    return frag(
        systemSwitch(r, "camhs"),
        camhsShell(frag(
            h("h2", "Referral: ", person ? title(person) : d.subject.value),
            h("div",
                h("span.pill", "Request type: ", f.v("/purpose", enumLabel("RequestPurposeCode", d.purpose), { code: true })), " ",
                h("span.pill.soft", "Received ", f.v("/dateCompleted", fmtDate(d.dateCompleted)))),
            h("h3", "Patient"),
            h("div.kv",
                h("div", "NHS number"), h("div", f.v("/subject/value", formatNhs(d.subject.value), { key: "subject" })),
                h("div", "Name"), h("div", person ? title(person) : h("em", "Not matched")),
                h("div", "Date of birth"), h("div", dob ? `${fmtDate(dob)} (${age(dob)} years)` : ""),
                h("div", "Matched by"), h("div", h("span.small", "NHS number, in the request's subject identifier"))),
            h("h3", "Referring agency"),
            h("div.kv",
                h("div", "Clinician"), h("div", f.v("/referrer", nameOf(d.referrer), { key: "referrer" })),
                h("div", "Agency"), h("div", "Anytown Borough Council: Children's Social Care"),
                h("div", "Sent to"), h("div", asList(d.recipient).map((x, i) => f.v(`/recipient/${i}`, nameOf(x), { key: "recipient" })))),
            h("h3", "Reason for referral"),
            reasons.map((q, i) => h("div", { style: "margin-bottom:.6rem" },
                h("div", { style: "font-variant:small-caps;color:var(--camhs)" }, f.v(`/assessmentQuestion/${i}/questionText`, q.questionText)),
                asList(q.answer).map((a, j) => f.v(`/assessmentQuestion/${i}/answer/${j}`, h("p", a), { block: true })))),
            h("h3", "Triage outcome and letters sent"),
            responses.length ? responses.map((x) => {
                const fx = fielder(x);
                return h("div.tile",
                    h("span.pill", fx.v("/status", enumLabel("ResponseStatusCode", x.data.status), { code: true })), " ",
                    h("span", { style: "font-family:var(--font);font-size:.9rem" }, fmtDateTime(x.data.dateTimeReceived)),
                    x.data.description ? h("p", fx.v("/description", x.data.description)) : null,
                    asList(x.data.attachment).map((a, i) => h("div", { style: "font-family:var(--font);font-size:.9rem" },
                        fx.v(`/attachment/${i}`, `📄 ${a.title}`, { key: "attachment" }))),
                    asList(x.data.linkedRecord).map((l, i) => h("div", { style: "font-family:var(--font);font-size:.9rem" },
                        "Onward referral: ", fx.v(`/linkedRecord/${i}`, nameOf(l.recordId), { key: "linkedRecord" }))),
                    h("div", h("a", { href: route(x), style: "font-family:var(--font);font-size:.85rem" }, "Same response in Example CMS")));
            }) : h("p", "No outcome sent yet."))));
}

// ------------------------------------------------------------------ gaps and about

export function gapsView() {
    return frag(
        h("div.page-head",
            h("h1", "Open questions"),
            h("p", "Where the standards are still open, awkward or silent. Each one is also marked with ◆ on the screens where it comes up. Tell us what you think by email or on GitHub (see ",
                h("a", { href: "#/about" }, "About"), ").")),
        h("ol.gap-list", annotations().map((a) => h("li", { id: `gap-${a.id}` },
            h("h2", h("span.gid", a.id), h("span", a.title)),
            h("p.where", "Where: ", h("a", { href: a.route }, a.where)),
            h("p", a.body),
            h("p", h("strong", "We'd like your view: "), a.question),
            a.issue ? h("p.small", h("a", { href: a.issue, target: "_blank", rel: "noopener" }, "Discuss it on GitHub")) : null))));
}

export function aboutView() {
    const meta = store.bundle.meta;
    const v = store.bundle.validation;
    const std = meta.standards;
    return frag(
        h("div.page-head", h("h1", "About this demo"), h("p", `A snapshot as at ${fmtLong(SNAPSHOT)}.`)),
        h("div.prose",
            h("p", "Example CMS is a fictional case management system, made to show what the ",
                h("a", { href: "https://standard.socialcaredata.io", target: "_blank", rel: "noopener" }, "Social Care Interoperability Standards"),
                " look like in practice. The standards are developed by Social Finance, the Open Data Institute and Coram."),
            h("p", "Everything here is fictional: Anytown Borough Council, its partners, the people, the professionals and every record. ",
                "Example CMS doesn't resemble any real product on purpose. The standards define the data underneath; your screens, forms and workflow stay your own."),
            h("h2", "How to read it"),
            h("ul",
                h("li", h("strong", "Left: "), "what a case management system might show. ", h("strong", "Right: "), "the same record according to the standard: the data itself, an explanation of each field, and a map of how records link."),
                h("li", h("strong", "Screen, Side by side, Data "), "(top right, or press ", h("kbd", "1"), " ", h("kbd", "2"), " ", h("kbd", "3"), ") choose what you see: the system's screen, both, or the record alone."),
                h("li", h("strong", "Show the standard "), "(top right, or press ", h("kbd", "S"), ") labels each value on the screen with its field name in the standard."),
                h("li", h("strong", "Stories "), "step through with Next and Previous, or the ", h("kbd", "←"), " ", h("kbd", "→"), " keys. ", h("kbd", "Esc"), " leaves a story."),
                h("li", h("strong", "Select any value "), "on the left to highlight it in the data on the right, or select a line on the right to find it on the left."),
                h("li", notStd("Grey italic text with a dashed line shows things a real system holds that the standards don't cover, such as case notes.", { inline: true })),
                h("li", h("span", { style: "color:var(--gap);font-weight:600" }, "◆ Open questions "), "mark where the standards are still open. ", h("a", { href: "#/gaps" }, "See them all.")),
                h("li", h("strong", "Anytown CAMHS "), "is a second fictional system. It shows the same request as the council's system, with a different screen. ", h("a", { href: "#/system/camhs" }, "Open it."))),
            h("h2", "Data and validation"),
            v ? h("p", v.valid ? "✓ " : "✗ ", `${v.records} records, `, v.valid ? "all valid " : `${v.problems} problem(s) `,
                "against SHACL shapes built from the standards, checked when the site was built. Every identifier in every record resolves to another record, or is listed as held elsewhere.") : null,
            h("p", "Built from the standard repository, ", h("code", "SocialCareData/standard"), " at commit ", h("code", meta.standardCommit.slice(0, 12)),
                ". The Referrals and Requests standard used here is the version proposed in pull request #110."),
            h("ul", Object.values(std).map((s) => h("li", h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.name)))),
            h("h2", "Give feedback"),
            h("p", "We'd like to hear what works, what's missing and what's wrong, especially on the ", h("a", { href: "#/gaps" }, "open questions"), "."),
            h("ul",
                h("li", "Email: ", h("a", { href: "mailto:DataStandards-SocialCare@socialfinance.org.uk" }, "DataStandards-SocialCare@socialfinance.org.uk")),
                h("li", "GitHub: ", h("a", { href: "https://github.com/SocialCareData/standard/issues", target: "_blank", rel: "noopener" }, "raise an issue on the standard"))),
            h("p.small.muted", `Site built ${fmtDateTime(meta.builtAt)}${meta.demoCommit ? ` from demo commit ${meta.demoCommit.slice(0, 7)}` : ""}.`)));
}

// ------------------------------------------------------------------ welcome

export function journeys() {
    return store.bundle.journeys || [];
}

/** One real value shown three ways: the council's screen, CAMHS's screen, and the record. */
function specimen() {
    const r = allRecords().find((x) => x.kind === "request" && asList(x.data.recipient).some((y) => y.value === "SVC-CAMHS"));
    if (!r) return null;
    const subj = r.data.subject;
    const person = resolve(subj)?.record;
    const name = person ? title(person) : subj.value;
    const json = JSON.stringify({ subject: subj }, null, 2).split("\n").slice(1, -1).map((l) => l.slice(2));
    const mark = (text) => h("span.hl-mark", text);
    return h("figure.specimen",
        h("div.specimen-row",
            h("div.frame",
                h("div.frame-head", h("span", "Example CMS, at the council"), h("a", { href: route(r) }, "Open")),
                fields([["Request", "To Anytown CAMHS"], ["About", h("span", name, h("br"), "NHS number ", mark(formatNhs(subj.value)))]])),
            h("div.frame.camhs",
                h("div.frame-head", h("span", "Anytown CAMHS, another supplier"), h("a", { href: `#/system/camhs/${r.localId}` }, "Open")),
                h("div", { style: "font-variant:small-caps;color:#6f2d78" }, "NHS number"),
                h("div", mark(formatNhs(subj.value))),
                h("div", { style: "font-variant:small-caps;color:#6f2d78;margin-top:.4rem" }, "Patient"),
                h("div", name)),
            h("div.frame.record",
                h("div.frame-head", h("span", "The record both systems read")),
                json.map((line) => h("div", line.includes(`"value"`) ? mark(line) : line)))),
        h("figcaption",
            "Riley's NHS number in a request from the council to CAMHS. Each system shows it its own way, on its own screen. ",
            "Underneath, both read the same record, written to the standard."));
}

export function welcomeView() {
    const list = journeys();
    const tour = list.find((j) => j.id === "tour");
    const stories = list.filter((j) => j.id !== "tour");
    const startLink = (j) => `#/story/${j.id}/1`;
    return h("div.welcome",
        h("h1", "Same data, different screens"),
        h("p.lede",
            "Example CMS is a made-up case management system for a made-up council, Anytown. ",
            "It holds the records of three people, written to the Social Care Interoperability Standards. ",
            "Wherever you go, you can see a system's screen and the record underneath it."),
        specimen(),
        h("div.starts",
            h("div",
                h("h2", "Where to start"),
                h("ul.route-list",
                    [tour, ...stories].filter(Boolean).map((j) => h("li",
                        h("div.what", h("a", { href: startLink(j) }, j.start || j.title), h("p", j.summary)),
                        h("span.count", j.minutes ? `${j.steps.length} steps, about ${j.minutes} minutes` : `${j.steps.length} steps`)))),
                h("p.explore",
                    h("span.muted", "Or look around:"),
                    h("a", { href: "#/people" }, "the people"),
                    h("a", { href: "#/directory" }, "the directory"),
                    h("a", { href: "#/map" }, "the map of every record"),
                    h("a", { href: "#/gaps" }, "the open questions"),
                    h("a", { href: "#/about" }, "about this demo"))),
            h("aside.reading",
                h("h2", "Reading the screens"),
                h("dl",
                    h("dt", "Screen, Side by side, Data"),
                    h("dd", "Top right. Choose the system's screen, the record underneath it, or both."),
                    h("dt", "Show the standard"),
                    h("dd", "Labels every value on the screen with its field name in the record. Press S to switch it on or off."),
                    h("dt", "Select a value"),
                    h("dd", "Marks it, and the same value in the record, like a highlighter. It works the other way too."),
                    h("dt", notStd("Grey italic with a dashed line", { inline: true })),
                    h("dd", "Things a real system holds that the standards don't cover, such as case notes."),
                    h("dt", h("span", { style: "color:var(--gap)" }, "◆ Open questions")),
                    h("dd", "Places where the standards are still undecided. We'd like your view on them.")))));
}
