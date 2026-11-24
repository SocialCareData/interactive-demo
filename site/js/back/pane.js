// The back-end pane: the same data according to the standard. Tabs: Data | Explained | Map.

import { h } from "../ui.js";
import { rec, title, store, KIND_LABEL } from "../store.js";
import { jsonView } from "./jsonview.js";
import { explainedView } from "./explained.js";
import { renderMap } from "../map.js";

const state = { recordId: null, tab: "data", mapScope: null, callout: null, emptyTab: "map" };

export function backState() {
    return state;
}

/** Show a record (or nothing) in the back pane. opts: {callout, mapScope} */
export function setBack(recordId, opts = {}) {
    state.recordId = recordId;
    state.callout = opts.callout || null;
    state.mapScope = opts.mapScope || null;
    if (!recordId) state.tab = "map";
    else if (state.tab === "map" && !opts.keepMap) state.tab = "data";
    render();
}

export function setTab(tab) {
    state.tab = tab;
    render();
}

function frontPaths() {
    if (!state.recordId) return [];
    const seen = [];
    for (const el of document.querySelectorAll(`#front .v[data-rec="${CSS.escape(state.recordId)}"]`)) {
        const p = el.getAttribute("data-path");
        if (!seen.includes(p)) seen.push(p);
    }
    return seen;
}

export function render() {
    const back = document.getElementById("back");
    back.replaceChildren();
    const r = state.recordId ? rec(state.recordId) : null;
    const tabs = r ? ["data", "explained", "map"] : ["map"];
    const names = { data: "Data", explained: "Explained", map: "Map" };

    const head = h("div.back-head",
        h("h2", r ? `In the standard: ${title(r)}` : "In the standard: the whole dataset"),
        r ? h("div.sub",
            `${KIND_LABEL[r.kind] || r.kind} · ${store.bundle.meta.standards[r.module]?.name || r.module}`,
            r.profile !== "standard" ? ` (${r.profile.replace(/-/g, " ")} profile)` : "",
            h("br"), h("code", r.id)) : h("div.sub", "Every record and every identifier link between them."),
        h("div.tabs", { role: "tablist", "aria-label": "Back-end views" },
            tabs.map((t) => h("button", {
                role: "tab", id: `tab-${t}`, "aria-selected": String(state.tab === t), "aria-controls": "tabpanel",
                onclick: () => setTab(t),
            }, names[t]))));

    const panel = h("div.tabpanel#tabpanel", { role: "tabpanel", "aria-labelledby": `tab-${state.tab}` });
    if (state.callout) panel.append(h("div.callout", state.callout));
    if (state.tab === "data" && r) {
        panel.append(h("p.small.muted", "The record exactly as it is stored and shared: JSON-LD, using the field names the standard defines. Select a line to find it on the left."));
        panel.append(jsonView(r.data));
    } else if (state.tab === "explained" && r) {
        panel.append(explainedView(r, frontPaths()));
    } else {
        const mapBox = h("div");
        panel.append(mapBox);
        renderMap(mapBox, { scope: state.mapScope || (r ? { type: "record", id: r.id } : { type: "all" }), compact: true });
    }
    back.append(head, panel);
    document.dispatchEvent(new CustomEvent("back:rendered"));
}
