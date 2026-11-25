// Small DOM and formatting helpers shared by every view.

import { KIND_LABEL, route, title, resolve, store, asList, fieldDoc, enumLabel } from "./store.js";

export const SNAPSHOT = "2026-11-26";

/** h("div.card#x", {attrs}, ...children) */
export function h(spec, attrs, ...children) {
    if (attrs === null || typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs)) {
        if (attrs !== undefined) children.unshift(attrs);
        attrs = {};
    }
    const m = spec.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
    const el = document.createElement((m && m[1]) || "div");
    if (m && m[2]) {
        for (const part of m[2].match(/[.#][\w-]+/g)) {
            if (part[0] === ".") el.classList.add(part.slice(1));
            else el.id = part.slice(1);
        }
    }
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === "class") el.className += (el.className ? " " : "") + v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else if (k === "html") el.innerHTML = v;
        else el.setAttribute(k, v === true ? "" : v);
    }
    append(el, children);
    return el;
}

function append(el, children) {
    for (const c of children.flat(Infinity)) {
        if (c === undefined || c === null || c === false) continue;
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
}

export function frag(...children) {
    const f = document.createDocumentFragment();
    append(f, children);
    return f;
}

// ------------------------------------------------------------------ dates

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const DT_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const LONG_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

function parse(iso) {
    if (!iso) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
}

export function fmtDate(iso) {
    const d = parse(iso);
    return d ? DATE_FMT.format(d) : "";
}

export function fmtDateTime(iso) {
    if (!iso) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return fmtDate(iso);
    return DT_FMT.format(parse(iso));
}

export function fmtLong(iso) {
    const d = parse(iso);
    return d ? LONG_FMT.format(d) : "";
}

export function age(dobIso, at = SNAPSHOT) {
    if (!dobIso) return null;
    const [y, m, d] = dobIso.split("-").map(Number);
    const [ay, am, ad] = at.split("-").map(Number);
    let a = ay - y;
    if (am < m || (am === m && ad < d)) a -= 1;
    return a;
}

/** "4 times a day", "every 2 weeks", "Sundays" from a FHIR-style Timing.frequency. */
export function frequencyText(freq) {
    if (freq === undefined || freq === null) return "";
    if (typeof freq === "string") return freq;
    const r = freq.repeat || freq;
    const days = { mon: "Mondays", tue: "Tuesdays", wed: "Wednesdays", thu: "Thursdays", fri: "Fridays", sat: "Saturdays", sun: "Sundays" };
    const units = { min: "minute", h: "hour", d: "day", wk: "week", mo: "month", a: "year" };
    const parts = [];
    if (r.dayOfWeek && r.dayOfWeek.length) parts.push(r.dayOfWeek.map((d) => days[d] || d).join(" and "));
    const n = r.frequency || 1;
    const p = r.period || 1;
    const u = units[r.periodUnit] || r.periodUnit;
    if (u && !(r.dayOfWeek && r.dayOfWeek.length && n === 1 && p === 1 && u === "week")) {
        const times = n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
        if (p === 1) parts.push(n === 1 ? `every ${u}` : `${times} a ${u}`);
        else parts.push(n === 1 ? `every ${p} ${u}s` : `${times} every ${p} ${u}s`);
    }
    if (r.timeOfDay && r.timeOfDay.length) parts.push(`at ${r.timeOfDay.map((t) => t.slice(0, 5)).join(", ")}`);
    const text = parts.join(", ");
    return text ? text[0].toUpperCase() + text.slice(1) : JSON.stringify(freq);
}

// ------------------------------------------------------------------ record-bound values (§5.2)

/**
 * Helpers bound to one record, so every rendered value carries its record and JSON pointer.
 * v(path, content, opts): a traceable value. opts.code shows the raw code in the X-ray chip;
 * opts.block puts the chip on its own line; opts.key overrides the chip's key text.
 */
export function fielder(r) {
    const data = r.data;
    function get(path) {
        let node = data;
        for (const seg of path.split("/").filter(Boolean)) {
            if (node === undefined || node === null) return undefined;
            node = node[seg];
        }
        return node;
    }
    function v(path, content, opts = {}) {
        const raw = get(path);
        const key = opts.key || path.split("/").filter((s) => s && !/^\d+$/.test(s)).pop() || "@id";
        // The chip reads like the JSON it stands for: concernType: "child.neglect"
        let chip = key;
        if (opts.code !== false && raw !== undefined && raw !== null && typeof raw !== "object") {
            const s = String(raw);
            if (opts.code || typeof raw === "boolean" || (s.length < 34 && s !== String(content))) {
                chip += `: ${typeof raw === "string" ? JSON.stringify(raw) : s}`;
            }
        }
        const tag = opts.block ? "div" : "span";
        const node = h(`${tag}.v`, {
            class: opts.block ? "block" : undefined,
            "data-rec": r.id,
            "data-path": path,
            "data-key": chip,
            tabindex: "0",
            role: "button",
            title: "Select to see this value in the standard",
        }, content === undefined ? (raw === undefined ? "" : String(raw)) : content);
        return openLinks(node);
    }
    function codeLabel(path, cls, key) {
        const raw = get(path);
        const doc = fieldDoc(r.module, cls, key);
        return doc && doc.enum ? enumLabel(doc.enum, raw) : raw;
    }
    return { v, get, codeLabel, data };
}

/**
 * A value that names another record (a person, a referral) is selected like any other value. So the
 * name itself isn't a link: a small "Open" beside it goes to the record.
 */
function openLinks(node) {
    for (const a of node.querySelectorAll("a.reclink")) {
        const name = h("span.reclink", ...a.childNodes);
        const open = h("a.open-link", {
            href: a.getAttribute("href"),
            "aria-label": `Open ${name.textContent.trim()}`,
            title: "Open this record",
        }, "Open");
        a.replaceWith(name, open);
    }
    return node;
}

// ------------------------------------------------------------------ shared bits

export function tag(kind, text) {
    return h(`span.tag.k-${kind}`, text || KIND_LABEL[kind] || kind);
}

export function recLink(r, text, opts = {}) {
    if (!r) return null;
    return h("a.reclink", { href: route(r), title: opts.title },
        opts.noTag ? null : tag(r.kind), h("span", text || title(r)));
}

/** A link for an Identifier: to the record it resolves to, or a "held elsewhere" chip. */
export function identLink(ident, opts = {}) {
    const res = resolve(ident);
    if (res && res.record) return recLink(res.record, opts.text, opts);
    if (res && res.external) {
        return h("span.reclink.external", { title: `Held by ${res.external.heldBy}: ${ident.system}` },
            tag("external"), h("span", `${res.external.label}`));
    }
    return h("span.reclink.external", `${ident.value} (${ident.system})`);
}

export function notStd(content, opts = {}) {
    return h(opts.inline ? "span.not-std-inline" : "div.not-std",
        opts.inline ? null : h("span.label", "Local to your system, not in the standard"),
        content);
}

export function gapMarker(a, opts = {}) {
    return h("details.gap", { class: opts.inline ? "inline" : undefined, "data-gap": a.id },
        h("summary", { title: `Open question ${a.id}` }, `${a.id} ${a.title}`),
        h("div.gap-body",
            h("p", a.body),
            h("p.gap-q", `We'd like your view: ${a.question}`),
            h("p.small",
                a.issue ? h("a", { href: a.issue, target: "_blank", rel: "noopener" }, "Discuss it on GitHub") : null,
                a.issue ? ", or see " : "See ",
                h("a", { href: "#/gaps" }, "all the open questions"), ".")));
}

export function card(titleText, ...body) {
    const head = typeof titleText === "string" ? h("h2", titleText)
        : titleText.tagName === "H2" ? titleText : h("header", titleText);
    return h("section.sec", head, h("div.body", body));
}

export function fields(rows) {
    const dl = h("dl.fields");
    for (const row of rows) {
        if (!row) continue;
        const [label, value] = row;
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) continue;
        dl.append(h("dt", label), h("dd", value));
    }
    return dl;
}

export function yesNo(b) {
    return b === true ? "Yes" : b === false ? "No" : "Not recorded";
}

export function listOf(items) {
    return asList(items).filter(Boolean);
}

export function sortByDate(records, dateFn, desc = false) {
    return [...records].sort((a, b) => {
        const c = (dateFn(a) || "").localeCompare(dateFn(b) || "");
        return desc ? -c : c;
    });
}

export function storeMeta() {
    return store.bundle.meta;
}
