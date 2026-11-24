// The Explained tab: field | value | meaning, in the order the fields appear on the screen
// on the left, then anything the screen doesn't show (§5.2 option 5).

import { h } from "../ui.js";
import { fieldDoc, enumDescription, store } from "../store.js";

function leaves(node, path, owner, out) {
    for (const [k, v] of Object.entries(node)) {
        if (k === "@context") continue;
        const p = `${path}/${k}`;
        if (k === "@id" || k === "@type") {
            if (!path) out.push({ path: p, key: k, owner, value: v });
            continue;
        }
        if (k === "frequency" || v === null || typeof v !== "object") {
            out.push({ path: p, key: k, owner, value: v });
        } else if (Array.isArray(v)) {
            if (v.every((x) => x === null || typeof x !== "object")) out.push({ path: p, key: k, owner, value: v });
            else v.forEach((item, i) => leaves(item, `${p}/${i}`, item["@type"] || owner, out));
        } else {
            leaves(v, p, v["@type"] || owner, out);
        }
    }
    return out;
}

const SPECIAL = {
    "@id": "A web address that uniquely identifies this record. Other records point at it through its identifier.",
    "@type": "The kind of record, and so which part of the standard defines its fields.",
};

export function explainedView(r, frontPaths) {
    const items = leaves(r.data, "", r.data["@type"], []);
    const rank = (p) => {
        for (let i = 0; i < frontPaths.length; i++) {
            const f = frontPaths[i];
            if (p === f || p.startsWith(`${f}/`)) return i;
        }
        return Infinity;
    };
    items.forEach((it, i) => { it.rank = rank(it.path); it.i = i; });
    items.sort((a, b) => (a.rank - b.rank) || (a.i - b.i));

    const tbody = h("tbody");
    let lastTop = null;
    let offscreenStarted = false;
    for (const it of items) {
        if (it.rank === Infinity && !offscreenStarted && frontPaths.length) {
            offscreenStarted = true;
            tbody.append(h("tr.explained-section", h("td", { colspan: 3 }, "Also in the record, but not shown on this screen")));
            lastTop = null;
        }
        const top = it.path.split("/")[1];
        if (top !== lastTop && !it.path.startsWith("/@")) {
            const doc = fieldDoc(r.module, r.data["@type"], top);
            tbody.append(h("tr.explained-section", h("td", { colspan: 3 }, doc ? `${top}: ${doc.title}` : top)));
            lastTop = top;
        }
        tbody.append(explainRow(r, it));
    }
    return h("div",
        h("p.small.muted", "Each row is one value in the record, in the order it appears on the screen. Select a row to find it on the left. Field names link to the standard."),
        h("div.table-wrap", h("table.explained",
            h("thead", h("tr", h("th", "Field"), h("th", "Value"), h("th", "Meaning"))),
            tbody)));
}

function explainRow(r, it) {
    const doc = SPECIAL[it.key] ? null : fieldDoc(r.module, it.owner, it.key);
    const std = doc ? store.bundle.meta.standards[doc.module] : null;
    const fieldCell = h("td",
        h("span.fld", it.key),
        h("span.std", it.owner && !it.key.startsWith("@") ? `on ${it.owner}` : ""),
        doc && doc.url ? h("a.std", { href: doc.url, target: "_blank", rel: "noopener" }, std ? std.name : "Standard") : null);

    const values = Array.isArray(it.value) ? it.value : [it.value];
    const valueCell = h("td");
    values.forEach((val, i) => {
        if (i) valueCell.append(h("br"));
        const text = typeof val === "object" ? JSON.stringify(val) : String(val);
        valueCell.append(h("code", text));
        if (doc && doc.enum) {
            const label = store.bundle.enums[doc.enum] && store.bundle.enums[doc.enum][val];
            if (label) valueCell.append(h("span.code-label", label.t));
        }
    });

    let meaning = SPECIAL[it.key] || (doc ? doc.description : "");
    if (doc && doc.enum && !Array.isArray(it.value)) {
        const d = enumDescription(doc.enum, it.value);
        if (d && d !== meaning) meaning = h("span", meaning, h("br"), h("span.muted", `This code: ${d}`));
    }
    if (doc && doc.required) meaning = h("span", meaning, " ", h("span.flag.neutral", "Required"));
    return h("tr", { "data-path": it.path, tabindex: "0" }, fieldCell, valueCell, h("td", meaning));
}
