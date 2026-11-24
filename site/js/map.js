// The galaxy map (PLAN.md §5.7): records as stars, resolved identifier references as lanes.
// d3 v7 is vendored in lib/ and loaded as a global. The layout is settled before it is drawn,
// so there's no animation (and nothing to switch off for prefers-reduced-motion).

import { h } from "./ui.js";
import {
    allRecords, rec, title, recDate, edgesFrom, edgesTo, recordsAboutPerson, store, route, enumLabel,
    REFERENCE_KINDS, KIND_LABEL, councilId,
} from "./store.js";
import { fmtDate } from "./ui.js";

const MODULE_COLOUR = {
    person: "var(--std-person)",
    safeguarding: "var(--std-safeguarding)",
    referrals: "var(--std-referrals)",
    "assessments-and-plans": "var(--std-ap)",
    external: "var(--std-external)",
};

const SHAPE = {
    referral: "triangle", request: "triangle", qoc: "triangle", response: "triangle",
    episode: "square", "life-event": "square",
    assessment: "diamond", plan: "diamond",
};

function seeded(seed) {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Work out the nodes and links for a scope: {type: all|person|record, id}. */
function graphFor(scope, showRef) {
    const ids = new Set();
    const add = (id) => ids.add(id);
    if (scope.type === "person") {
        add(scope.id);
        for (const r of recordsAboutPerson(scope.id)) add(r.id);
        for (const e of edgesFrom(scope.id)) add(e.to);
        for (const e of edgesTo(scope.id)) if (rec(e.from)?.kind === "person") add(e.from);
        for (const id of [...ids]) {
            for (const e of edgesFrom(id)) {
                const t = rec(e.to);
                if (!t || REFERENCE_KINDS.has(t.kind) || e.to.startsWith("ext:")) add(e.to);
            }
        }
    } else if (scope.type === "record") {
        add(scope.id);
        for (const e of edgesFrom(scope.id)) add(e.to);
        for (const e of edgesTo(scope.id)) add(e.from);
    } else {
        for (const r of allRecords()) add(r.id);
        for (const e of store.bundle.edges) if (e.to.startsWith("ext:")) add(e.to);
    }
    const nodes = [];
    for (const id of ids) {
        if (id.startsWith("ext:")) {
            const ext = store.bundle.external[id.slice(4)];
            nodes.push({ id, kind: "external", module: "external", label: ext ? ext.label : id, ext });
            continue;
        }
        const r = rec(id);
        if (!r) continue;
        if (!showRef && REFERENCE_KINDS.has(r.kind) && id !== scope.id) continue;
        nodes.push({ id, r, kind: r.kind, module: r.module, label: title(r) });
    }
    const present = new Set(nodes.map((n) => n.id));
    const links = store.bundle.edges
        .filter((e) => present.has(e.from) && present.has(e.to))
        .map((e) => ({ source: e.from, target: e.to, property: e.property, relationship: e.relationship }));
    return { nodes, links };
}

function radius(n) {
    if (n.kind === "person") return n.r.profile === "subject-of-care" ? 12 : 8;
    if (REFERENCE_KINDS.has(n.kind)) return 4.5;
    if (n.kind === "external") return 6;
    return 7;
}

function symbolPath(n) {
    const size = Math.PI * radius(n) ** 2;
    const type = { triangle: d3.symbolTriangle, square: d3.symbolSquare, diamond: d3.symbolDiamond }[SHAPE[n.kind]] || d3.symbolCircle;
    return d3.symbol().type(type).size(size)();
}

export function renderMap(container, opts = {}) {
    let scope = opts.scope || { type: "all" };
    let showRef = scope.type !== "all";
    const height = opts.full ? Math.max(480, window.innerHeight - 190) : 440;

    const wrap = h("div.map-wrap");
    const controls = h("div.map-controls");
    const svgBox = h("div", { style: `height:${height}px` });
    const tip = h("div.map-tip", { role: "status" });
    const legend = h("div.map-legend",
        [["Person standard", "person"], ["Safeguarding", "safeguarding"], ["Referrals and Requests", "referrals"],
            ["Assessments and Plans", "assessments-and-plans"], ["Held elsewhere", "external"]]
            .map(([label, m]) => h("span", h("i", { style: `background:${MODULE_COLOUR[m]}` }), label)),
        h("span", "● person  ▲ referral / request / response  ■ episode / event  ◆ assessment / plan  · directory"));
    const listing = h("details.map-list", { style: "padding:.4rem .6rem" });
    wrap.append(controls, svgBox, tip, legend);
    container.replaceChildren(wrap, listing);

    function scopeOptions() {
        const opts2 = [["all", "Whole dataset"]];
        const person = scope.type === "person" ? rec(scope.id) : null;
        if (person) opts2.push([`person:${person.id}`, `This person: ${title(person)}`]);
        if (scope.type === "record" || opts.recordId) {
            const rid = scope.type === "record" ? scope.id : opts.recordId;
            opts2.push([`record:${rid}`, `This record and its neighbours`]);
        }
        for (const p of allRecords().filter((r) => r.kind === "person" && r.profile === "subject-of-care")) {
            if (!person || person.id !== p.id) opts2.push([`person:${p.id}`, `Person: ${title(p)}`]);
        }
        return opts2;
    }

    function drawControls() {
        const current = scope.type === "all" ? "all" : `${scope.type}:${scope.id}`;
        const sel = h("select", { "aria-label": "What to show on the map" },
            scopeOptions().map(([v, label]) => h("option", { value: v, selected: v === current }, label)));
        sel.addEventListener("change", () => {
            const [type, ...rest] = sel.value.split(":");
            scope = type === "all" ? { type: "all" } : { type, id: rest.join(":") };
            showRef = scope.type !== "all";
            draw();
        });
        const ref = h("input", { type: "checkbox", checked: showRef });
        ref.addEventListener("change", () => { showRef = ref.checked; draw(); });
        controls.replaceChildren(
            h("label", "Show ", sel),
            h("label", ref, "Directory (organisations, services, professionals)"),
            opts.full ? null : h("a", { href: "#/map", style: "color:#cfe" }, "Full screen"));
    }

    function draw() {
        drawControls();
        const { nodes, links } = graphFor(scope, showRef);
        const width = svgBox.clientWidth || 600;
        const focusId = scope.type === "all" ? null : scope.id;

        // Settle the layout before drawing: deterministic, and no motion.
        const rand = seeded(42);
        nodes.forEach((n) => { n.x = (rand() - 0.5) * width; n.y = (rand() - 0.5) * height; });
        const sim = d3.forceSimulation(nodes)
            .randomSource(seeded(7))
            .force("link", d3.forceLink(links).id((d) => d.id).distance((l) => (REFERENCE_KINDS.has(l.target.kind) ? 70 : 45)).strength(0.5))
            .force("charge", d3.forceManyBody().strength((n) => (n.kind === "person" ? -260 : -90)))
            .force("x", d3.forceX(0).strength(0.04))
            .force("y", d3.forceY(0).strength(0.06))
            .force("collide", d3.forceCollide((n) => radius(n) + 3))
            .force("ext", d3.forceRadial((n) => (n.kind === "external" ? Math.min(width, height) * 0.48 : 0)).strength((n) => (n.kind === "external" ? 0.3 : 0)))
            .stop();
        for (let i = 0; i < 360; i++) sim.tick();

        const svg = d3.create("svg").attr("viewBox", [-width / 2, -height / 2, width, height]).attr("role", "img")
            .attr("aria-label", `Map of ${nodes.length} records and ${links.length} links between them`);
        const stars = seeded(3);
        svg.append("g").selectAll("circle").data(d3.range(140)).join("circle")
            .attr("cx", () => (stars() - 0.5) * width * 2).attr("cy", () => (stars() - 0.5) * height * 2)
            .attr("r", () => stars() * 0.9 + 0.2).attr("fill", "rgba(255,255,255,0.35)");
        const g = svg.append("g");

        const link = g.append("g").selectAll("line").data(links).join("line")
            .attr("class", (l) => `map-link${l.property === "linkedRecord" ? " linked" : ""}`)
            .attr("stroke-width", 1.2)
            .attr("x1", (l) => l.source.x).attr("y1", (l) => l.source.y)
            .attr("x2", (l) => l.target.x).attr("y2", (l) => l.target.y);
        // Wide invisible lines for hovering an edge.
        g.append("g").selectAll("line").data(links).join("line")
            .attr("stroke", "transparent").attr("stroke-width", 9)
            .attr("x1", (l) => l.source.x).attr("y1", (l) => l.source.y)
            .attr("x2", (l) => l.target.x).attr("y2", (l) => l.target.y)
            .on("mousemove", (ev, l) => showTip(ev, `${l.relationship ? enumLabel("RecordRelationshipCode", l.relationship) : l.property}: ${l.source.label} → ${l.target.label}`))
            .on("mouseleave", hideTip);

        const node = g.append("g").selectAll("g").data(nodes).join("g")
            .attr("class", "map-node")
            .attr("transform", (n) => `translate(${n.x},${n.y})`)
            .attr("tabindex", 0)
            .attr("role", "link")
            .attr("aria-label", (n) => `${KIND_LABEL[n.kind] || n.kind}: ${n.label}`);
        node.append("path")
            .attr("d", symbolPath)
            .attr("fill", (n) => MODULE_COLOUR[n.module] || "#999")
            .attr("fill-opacity", (n) => (n.kind === "external" ? 0.35 : REFERENCE_KINDS.has(n.kind) ? 0.6 : 0.95))
            .attr("stroke", (n) => (n.id === focusId ? "#fff" : n.kind === "external" ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.4)"))
            .attr("stroke-dasharray", (n) => (n.kind === "external" ? "2 2" : null))
            .attr("stroke-width", (n) => (n.id === focusId ? 3 : 1));
        node.filter((n) => n.kind === "person" || n.kind === "external" || n.id === focusId)
            .append("text").attr("class", "map-label").attr("x", (n) => radius(n) + 4).attr("y", 3)
            .text((n) => (n.kind === "external" ? `Held elsewhere: ${n.label}` : n.label));

        node.on("click", (_, n) => go(n))
            .on("keydown", (ev, n) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(n); } })
            .on("mousemove", (ev, n) => { highlight(n); showTip(ev, tipText(n)); })
            .on("focus", (ev, n) => { highlight(n); showTip(ev, tipText(n), true); })
            .on("mouseleave blur", () => { highlight(null); hideTip(); });

        function highlight(n) {
            link.classed("hl", (l) => n && (l.source.id === n.id || l.target.id === n.id));
        }

        const zoom = d3.zoom().scaleExtent([0.3, 4]).on("zoom", (ev) => g.attr("transform", ev.transform));
        svg.call(zoom);
        // Fit the settled layout into the box, with room for labels.
        const xs = nodes.map((n) => n.x);
        const ys = nodes.map((n) => n.y);
        const [x0, x1, y0, y1] = [Math.min(...xs) - 20, Math.max(...xs) + 140, Math.min(...ys) - 20, Math.max(...ys) + 20];
        const k = Math.min(1.6, 0.95 * Math.min(width / (x1 - x0), height / (y1 - y0)));
        svg.call(zoom.transform, d3.zoomIdentity.scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));

        svgBox.replaceChildren(svg.node());

        listing.replaceChildren(h("summary", `Links on this map, as a list (${links.length})`),
            h("ul.small", links.map((l) => h("li",
                l.source.r ? h("a", { href: route(l.source.r) }, l.source.label) : l.source.label,
                ` → ${l.relationship ? enumLabel("RecordRelationshipCode", l.relationship) : l.property} → `,
                l.target.r ? h("a", { href: route(l.target.r) }, l.target.label) : `${l.target.label} (held elsewhere)`))));
    }

    function tipText(n) {
        if (n.kind === "external") return `Held elsewhere · ${n.label} · ${n.ext?.heldBy || ""}`;
        const date = recDate(n.r);
        return `${KIND_LABEL[n.kind]} · ${n.label}${date ? ` · ${fmtDate(date)}` : ""}`;
    }
    function showTip(ev, text, atNode) {
        const box = wrap.getBoundingClientRect();
        const t = atNode ? ev.target.getBoundingClientRect() : { left: ev.clientX, top: ev.clientY };
        tip.textContent = text;
        tip.style.display = "block";
        tip.style.left = `${Math.min(t.left - box.left + 12, box.width - 220)}px`;
        tip.style.top = `${t.top - box.top + 12}px`;
    }
    function hideTip() { tip.style.display = "none"; }
    function go(n) {
        if (n.r) location.hash = route(n.r);
    }

    // Draw once the container has a width.
    requestAnimationFrame(draw);
}

export function councilRoute(p) {
    return `#/person/${councilId(p)}`;
}
