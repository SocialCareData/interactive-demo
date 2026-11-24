// JSON-LD rendered as DOM, not as highlighted text, so every key/value row carries its
// JSON pointer (data-path) and can be traced to the front end (§5.2).

import { h } from "../ui.js";
import { resolve, title } from "../store.js";

let rootData = null;

export function jsonView(data) {
    const root = h("div.json", { role: "tree", "aria-label": "Record as JSON-LD" });
    rootData = data;
    root.append(row(null, data, "", true));
    return root;
}

function row(key, value, path, isLast) {
    const el = h("div.j-row", { "data-path": path || "/", role: "treeitem" });
    if (key !== null) {
        el.append(h("span.j-key", JSON.stringify(key)), h("span.j-punct", ": "));
    }
    const comma = isLast ? "" : ",";
    if (value !== null && typeof value === "object") {
        const isArr = Array.isArray(value);
        const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
        if (!entries.length) {
            el.append(h("span.j-punct", (isArr ? "[]" : "{}") + comma));
            return el;
        }
        el.append(h("span.j-punct", isArr ? "[" : "{"));
        entries.forEach(([k, v], i) => {
            el.append(row(isArr ? null : k, v, `${path}/${k}`, i === entries.length - 1));
        });
        const close = h("div", h("span.j-punct", (isArr ? "]" : "}") + comma));
        if (!isArr && value["@type"] === "Identifier") {
            const res = resolve(value);
            if (res && !(res.record && res.record.data === rootData)) {
                const label = res.record ? `// ${title(res.record)}` : `// held elsewhere: ${res.external.label}`;
                close.append(" ", h("span.j-note", { title: "Added by this demo: the record this identifier points to. Not part of the data." }, label));
            }
        }
        el.append(close);
        return el;
    }
    el.append(primitive(value), h("span.j-punct", comma));
    return el;
}

function primitive(v) {
    if (typeof v === "string") return h("span.j-str", JSON.stringify(v));
    if (typeof v === "number") return h("span.j-num", String(v));
    if (typeof v === "boolean") return h("span.j-bool", String(v));
    return h("span.j-null", "null");
}
