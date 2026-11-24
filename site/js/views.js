// Page-level views: home (front door + caseload), person, CAMHS second system, gaps, about.

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
            return `${enumLabel("ReferralTypeCode", d.type)} referral from ${from || "unknown"} · ${concerns}`;
        }
        case "qoc":
            return `Quality-of-care concern about ${d.service && d.service.name} · concern type ${asList(d.concern).map((c) => enumLabel("QocConcernCode", c.concernType)).join(", ")}`;
        case "request":
            return `Request to ${asList(d.recipient).map(nameOf).join(", ")}: ${enumLabel("RequestPurposeCode", d.purpose)}`;
        case "response":
            return `${enumLabel("ResponseStatusCode", d.status)} by ${nameOf(d.responder)}`;
        case "episode": {
            const end = recEnd(r);
            return `${asList(d.type).map((t) => enumLabel("EpisodeCode", t)).join(", ")} (${end ? `to ${fmtDate(end)}` : "open"})`;
        }
        case "life-event":
            return `${asList(d.type).map((t) => enumLabel("EventCode", t)).join(", ")}${d.location ? ` · ${asList(d.location)[0]}` : ""}`;
        case "assessment":
            return `Care needs assessment (${enumLabel("DocumentStatus", d.status)}) by ${nameOf(d.professionalId)}`;
        case "plan":
            return `Care and support plan (${enumLabel("DocumentStatus", d.status)}), ${asList(d.careComponent).length} parts`;
        default:
            return title(r);
    }
}

// ------------------------------------------------------------------ home

export function homeView() {
    const intake = sortByDate(allRecords().filter((r) => r.kind === "referral" || r.kind === "qoc"), recDate, true);
    const people = allRecords().filter((r) => r.kind === "person" && r.profile === "subject-of-care");

    const queue = h("table.list",
        h("thead", h("tr", h("th", "Received"), h("th", "Type"), h("th", "About"), h("th", "From"), h("th", "Concern"), h("th", "Status"))),
        h("tbody", intake.map((r) => {
            const f = fielder(r);
            const d = r.data;
            const responses = responsesTo(r);
            const last = responses[responses.length - 1];
            const subj = asList(d.subject)[0];
            const about = peopleFor(r);
            const isQoc = r.kind === "qoc";
            const from = d.referrer ? (d.referrer.professional ? formalName([d.referrer.professional.name])
                : d.referrer.professionalId ? nameOf(d.referrer.professionalId)
                    : d.referrer.person ? personName(d.referrer.person.name) : "") : "Anonymous";
            return h("tr",
                h("td", f.v("/dateCompleted", fmtDate(d.dateCompleted))),
                h("td", h("a", { href: route(r) }, isQoc ? "Quality-of-care concern" : enumLabel("ReferralTypeCode", d.type))),
                h("td", about.length ? about.map((p) => recLink(p, null, { noTag: true }))
                    : subj ? personName(subj.name) || "Name not known" : ""),
                h("td", from, d.referrer ? h("div.small.muted", enumLabel("ReferrerTypeCode", d.referrer.referrerType)) : null),
                h("td", asList(d.concern).map((c, i) => c.concernType === "UNASSIGNED"
                    ? h("span.flag.warn", f.v(`/concern/${i}/concernType`, "Concern type: Unassigned, awaiting triage", { code: true }))
                    : h("div", f.v(`/concern/${i}/concernType`, enumLabel(isQoc ? "QocConcernCode" : "ConcernCode", c.concernType), { code: true })))),
                h("td", last ? h("span", enumLabel("ResponseStatusCode", last.data.status), h("div.small.muted", fmtDate(recDate(last))))
                    : h("span.flag.warn", isQoc ? "Awaiting triage" : "New")));
        })));

    const caseload = h("table.list",
        h("thead", h("tr", h("th", "Name"), h("th", "Age"), h("th", "NHS number"), h("th", "Open episodes"), h("th", "Allocated worker"))),
        h("tbody", people.map((p) => {
            const open = recordsAboutPerson(p.id).filter((r) => r.kind === "episode" && !recEnd(r));
            const local = uiPerson(councilId(p));
            return h("tr",
                h("td", recLink(p, null, { noTag: true })),
                h("td", age(p.data.dateOfBirth && p.data.dateOfBirth.date)),
                h("td", formatNhs(nhsNumber(p))),
                h("td", open.length ? open.map((e) => h("div", recLink(e))) : h("span.muted", "None")),
                h("td", local && local.allocatedWorker ? notStd(`${local.allocatedWorker} (${local.team})`, { inline: true }) : ""));
        })));

    const dir = (kind) => allRecords().filter((r) => r.kind === kind).sort((a, b) => title(a).localeCompare(title(b)));
    const dirGaps = annotations().filter((a) => asList(a.views).includes("directory"));

    return frag(
        h("div.cms-head",
            h("div", h("h1", "Front door and caseload"),
                h("div.sub", "Anytown Borough Council · ", fmtLong(SNAPSHOT))),
            h("p.small.muted", { style: "max-width:28rem" },
                "This is Example CMS, a fictional case management system. On the right is what the standards see. ",
                "Press ", h("kbd", "S"), " or use “Show the standard” to label every value with its field in the standard.")),
        card("Front door: referrals and concerns received", h("div.table-wrap", queue),
            h("p.small.muted", "Status comes from the latest Response record for each referral or concern.")),
        card("People: subjects of care", h("div.table-wrap", caseload)),
        card("Directory",
            h("div.grid-2",
                h("div", h("h3", "Organisations"), h("ul.links-list", dir("organisation").map((r) => h("li", recLink(r)))),
                    h("h3", "Professionals"), h("ul.links-list", dir("professional").map((r) => h("li", recLink(r))))),
                h("div", h("h3", "Services"), h("ul.links-list", dir("service").map((r) => h("li", recLink(r)))))),
            dirGaps.map((a) => gapMarker(a))));
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

    // Relationships: outgoing relatedPerson, plus people who list this person.
    const rels = asList(d.relatedPerson).map((rp, i) => h("li",
        f.v(`/relatedPerson/${i}/identifier`, identLink(rp.identifier), { key: "identifier" }), " ",
        asList(rp.relationship).map((c, j) => f.v(`/relatedPerson/${i}/relationship/${j}`, h("span.small.muted", enumLabel("PersonRelationshipCode", c)), { code: true }))));

    // Involved professionals and services, derived from the person's records.
    const involved = new Map();
    for (const r of records) {
        for (const e of edgesFrom(r.id)) {
            const t = rec(e.to);
            if (!t || !["professional", "service", "organisation"].includes(t.kind)) continue;
            if (!involved.has(t.id)) involved.set(t.id, { r: t, via: new Set() });
            involved.get(t.id).via.add(r.kind);
        }
    }

    return frag(
        h("div.crumbs", h("a", { href: "#/" }, "Home"), " › ", isSubject ? "Subject of care" : "Connected person"),
        h("div.cms-head",
            h("div",
                h("h1", tag("person"), " ", f.v("/name/0", personName(d.name))),
                h("div.sub",
                    asList(d.identifier).map((id, i) => h("span", i ? " · " : "",
                        f.v(`/identifier/${i}/value`, id.system.includes("nhs-number") ? `NHS ${formatNhs(id.value)}` : `Council ID ${id.value}`))))),
            local.allocatedWorker || local.localStatus || local.lastViewed || asList(local.flags).length
                ? h("div", { style: "max-width:30rem" }, notStd(h("div",
                    local.allocatedWorker ? h("div", h("strong", "Allocated: "), `${local.allocatedWorker}, ${local.team}`) : null,
                    local.localStatus ? h("div", h("strong", "Case status: "), local.localStatus) : null,
                    asList(local.flags).length ? h("div", h("strong", "Flags: "), asList(local.flags).map((fl) => h(`span.flag.${fl.level || "neutral"}`, { style: "margin-right:.3rem" }, fl.text))) : null,
                    local.lastViewed ? h("div.small", `Last viewed by ${local.lastViewed}`) : null)))
                : null),
        h("div.grid-2",
            card("Personal details", fields([
                ["Full name", f.v("/name/0", formalName(d.name))],
                ["Date of birth", dob ? h("span", f.v("/dateOfBirth/date", fmtDate(dob)), " ",
                    f.v("/dateOfBirth/accuracyIndicator", h("span.small.muted", accuracy(d.dateOfBirth.accuracyIndicator)), { code: true })) : null],
                ["Age", dob ? `${age(dob)}` : null],
                ["Gender", d.genderCode ? f.v("/genderCode", enumLabel("GenderCode", d.genderCode), { code: true }) : null],
                ["Ethnicity", d.ethnicityCode ? f.v("/ethnicityCode", enumLabel("EthnicityCode", d.ethnicityCode), { code: true }) : null],
                ["Address", asList(d.address).map((a, i) => f.v(`/address/${i}`, [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(", "), { block: true }))],
                ["Contact", asList(d.contact).map((c, i) => f.v(`/contact/${i}`, [c.name, ...asList(c.telephone), ...asList(c.email)].filter(Boolean).join(" · "), { block: true }))],
                ["Communication needs", asList(d.communication).map((c, i) => f.v(`/communication/${i}/specialCommunicationNeeds`, c.specialCommunicationNeeds, { block: true }))],
                ["Deceased", d.isDeceased !== undefined ? f.v("/isDeceased", d.isDeceased ? "Yes" : "No") : null],
            ]), isSubject ? null : h("p.small.muted", "A connected person: the standard requires only a name.")),
            h("div",
                card("Relationships", rels.length ? h("ul.links-list", rels) : h("p.muted", "None recorded.")),
                isSubject ? card("Involved professionals and services",
                    involved.size ? h("ul.links-list", [...involved.values()].map((x) => h("li", recLink(x.r),
                        h("span.small.muted", ` via ${[...x.via].map((k) => KIND_LABEL[k].toLowerCase()).join(", ")}`))))
                        : h("p.muted", "None."),
                    h("p.small.muted", "Worked out from the records below, not stored on the person.")) : null,
                asList(local.tasks).length ? card("Tasks", notStd(h("ul", asList(local.tasks).map((t) =>
                    h("li", h("strong", fmtDate(String(t.due))), ` ${t.text} (${t.owner})`))))) : null)),
        isSubject ? chronology(p, records, local) : null);
}

function accuracy(code) {
    if (!code) return "";
    const word = { A: "accurate", E: "estimated", U: "unknown" };
    return `(day ${word[code[0]]}, month ${word[code[1]]}, year ${word[code[2]]})`;
}

const FILTER_KINDS = ["referral", "qoc", "response", "request", "episode", "life-event", "assessment", "plan", "local"];

function chronology(p, records, local) {
    const rows = records.map((r) => ({ date: recDate(r), kind: r.kind, r }));
    for (const n of asList(local.notes)) rows.push({ date: String(n.date), kind: "local", note: n });
    rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const present = FILTER_KINDS.filter((k) => rows.some((x) => x.kind === k));
    const active = new Set(present);

    const tbody = h("tbody");
    function draw() {
        tbody.replaceChildren(...rows.filter((x) => active.has(x.kind)).map((x) => x.note
            ? h("tr.not-std-row",
                h("td", fmtDate(x.date)), h("td", tag("local", x.note.type)),
                h("td", h("strong", `${x.note.type} (${x.note.by}): `), x.note.text, h("span.not-std-label", "Not part of the standard: local to your system")))
            : h("tr",
                h("td", fmtDate(x.date)), h("td", tag(x.kind)),
                h("td", h("a", { href: route(x.r) }, summary(x.r)),
                    annotations().filter((a) => asList(a.views).includes("chronology") && asList(a.records).includes(x.r.id))
                        .map((a) => gapMarker(a, { inline: true }))))));
    }
    const filters = h("div.filters", { role: "group", "aria-label": "Filter the chronology by kind" },
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
    return card("Chronology",
        h("p.small.muted", "Every record concerning this person, oldest first. Greyed rows are local case notes the standards don't cover."),
        filters,
        h("div.table-wrap", h("table.list", h("thead", h("tr", h("th", "Date"), h("th", "Kind"), h("th", "Summary"))), tbody)),
        annotations().filter((a) => asList(a.views).includes("chronology") && !asList(a.records).length).map((a) => gapMarker(a)));
}

// ------------------------------------------------------------------ second system: Anytown CAMHS

function camhsRequests() {
    return sortByDate(allRecords().filter((r) => r.kind === "request" && asList(r.data.recipient).some((x) => x.value === "SVC-CAMHS")), recDate, true);
}

function camhsShell(main) {
    const n = camhsRequests().length;
    return h("div.theme-camhs",
        h("div.camhs-shell",
            h("div.camhs-bar", h("strong", "Anytown CAMHS · Referral Management"), h("span", "Signed in: Dr P. Nair, Intake clinician")),
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
                    `NHS ${formatNhs(r.data.subject.value)} · received ${fmtDate(r.data.dateCompleted)} · from ${nameOf(r.data.referrer)}, Anytown Borough Council `,
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
        h("div.cms-head", h("div", h("h1", "Open questions"),
            h("div.sub", "Where the standards are still open, awkward or silent. This is where we'd like your help."))),
        h("div.prose",
            h("p", "Each question is also marked with ◆ on the screens where it comes up. Tell us what you think by email or on GitHub (see ",
                h("a", { href: "#/about" }, "About"), ")."),
            h("ol.gap-list", annotations().map((a) => h("li", { id: `gap-${a.id}` },
                h("h2", `${a.id}: ${a.title}`),
                h("p.small.muted", "Where: ", h("a", { href: a.route }, a.where)),
                h("p", a.body),
                h("p", h("strong", "We'd like your view: "), a.question),
                a.issue ? h("p.small", h("a", { href: a.issue, target: "_blank", rel: "noopener" }, "Discussion on GitHub")) : null)))));
}

export function aboutView() {
    const meta = store.bundle.meta;
    const v = store.bundle.validation;
    const std = meta.standards;
    return frag(
        h("div.cms-head", h("div", h("h1", "About this demo"), h("div.sub", `A snapshot as at ${fmtLong(SNAPSHOT)}`))),
        h("div.prose",
            h("p", "Example CMS is a fictional case management system, made to show what the ",
                h("a", { href: "https://standard.socialcaredata.io", target: "_blank", rel: "noopener" }, "Social Care Interoperability Standards"),
                " look like in practice. The standards are developed by Social Finance, the Open Data Institute and Coram."),
            h("p", "Everything here is fictional: Anytown Borough Council, its partners, the people, the professionals and every record. ",
                "Example CMS doesn't resemble any real product on purpose. The standards define the data underneath; your screens, forms and workflow stay your own."),
            h("h2", "How to read it"),
            h("ul",
                h("li", h("strong", "Left: "), "what a case management system might show. ", h("strong", "Right: "), "the same record according to the standard: the data itself, an explanation of each field, and a map of how records link."),
                h("li", h("strong", "Show the standard "), "(button at the top, or press ", h("kbd", "S"), ") labels each value on the left with its field name in the standard."),
                h("li", h("strong", "Select any value "), "on the left to highlight it in the data on the right, or select a line on the right to find it on the left."),
                h("li", notStd("Greyed, dashed boxes are things a real system shows that the standards don't cover, such as allocated workers, case notes and tasks.", { inline: true })),
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
