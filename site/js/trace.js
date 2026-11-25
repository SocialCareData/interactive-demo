// §5.2: connecting the front end to the back end.
//  - X-ray: "Show the standard" (button or S key) puts a field-name chip on every traceable value.
//  - Click-to-trace: selecting a value (click, tap, Enter/Space) pins it, and outlines the matching
//    JSON lines and Explained rows. Selecting a JSON line or Explained row does the reverse.

import { backState, setBack, setTab } from "./back/pane.js";
import { getView, setView, isTyping } from "./view.js";

let selected = null; // { rec, path }

export function initTrace() {
    const toggle = document.getElementById("xray");
    let on = false;
    try { on = localStorage.getItem("xray") === "1"; } catch { /* storage unavailable */ }
    setXray(on);
    toggle.addEventListener("click", () => setXray(!document.body.classList.contains("xray")));
    document.addEventListener("keydown", (ev) => {
        if (ev.key.toLowerCase() !== "s" || ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target)) return;
        setXray(!document.body.classList.contains("xray"));
    });

    const front = document.getElementById("front");
    front.addEventListener("click", (ev) => {
        const el = ev.target.closest(".v");
        if (!el || ev.target.closest("a")) return;
        selectFromFront(el);
    });
    front.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        const el = ev.target.closest && ev.target.closest(".v");
        if (!el || ev.target !== el) return;
        ev.preventDefault();
        selectFromFront(el);
    });

    const back = document.getElementById("back");
    const fromBack = (ev) => {
        if (ev.target.closest("a, button")) return;
        const row = ev.target.closest(".json [data-path], table.explained tr[data-path]");
        if (!row) return;
        ev.stopPropagation();
        const st = backState();
        if (!st.recordId) return;
        selected = { rec: st.recordId, path: row.getAttribute("data-path"), from: "back" };
        apply(false);
        announce();
    };
    back.addEventListener("click", fromBack);
    back.addEventListener("keydown", (ev) => {
        if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches("tr[data-path]")) {
            ev.preventDefault();
            fromBack(ev);
        }
    });

    document.addEventListener("back:rendered", () => apply(false, true));
    document.getElementById("jump-data").addEventListener("click", () => {
        const t = document.querySelector("#back .traced") || document.getElementById("back");
        t.scrollIntoView({ block: "center" });
    });
}

export function setXray(on, { persist = true } = {}) {
    document.body.classList.toggle("xray", on);
    document.getElementById("xray").setAttribute("aria-pressed", String(on));
    if (persist) {
        try { localStorage.setItem("xray", on ? "1" : "0"); } catch { /* storage unavailable */ }
    }
}

/** Highlight one value programmatically (used by stories), on the screen and in the record. */
export function selectPath(recId, path, { scroll = true } = {}) {
    if (!recId || !path) return;
    selected = { rec: recId, path, from: "story" };
    announce();
    const st = backState();
    if (st.recordId !== recId) setBack(recId);
    else apply(true);
    const el = document.querySelector("#front .v.traced");
    if (el && scroll) {
        const r = el.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight * 0.6) el.scrollIntoView({ block: "center" });
    }
}

/** Tell anyone listening (stories) that a value has been selected. */
function announce() {
    document.dispatchEvent(new CustomEvent("trace:selected", { detail: { ...selected } }));
}

export function clearTrace() {
    selected = null;
    document.querySelectorAll(".traced").forEach((e) => e.classList.remove("traced"));
    document.getElementById("jump-data").hidden = true;
}

function selectFromFront(el) {
    const recId = el.getAttribute("data-rec");
    const path = el.getAttribute("data-path");
    selected = { rec: recId, path, from: "front" };
    announce();
    if (getView() === "screen") setView("split");
    const st = backState();
    if (st.recordId !== recId) {
        setBack(recId, { callout: st.callout && st.recordId === recId ? st.callout : null });
    } else if (st.tab === "map") {
        setTab("data");
    } else {
        apply(true);
    }
}

function related(a, b) {
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** Bring el to the middle of a scrolling container, without scrolling anything else. */
function scrollWithin(box, el) {
    let pane = el.parentElement;
    while (pane && pane !== box.parentElement) {
        const o = getComputedStyle(pane).overflowY;
        if ((o === "auto" || o === "scroll") && pane.scrollHeight > pane.clientHeight) break;
        pane = pane.parentElement;
    }
    if (!pane || pane === box.parentElement) return;
    const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    pane.scrollTop += top - pane.clientHeight / 2 + el.offsetHeight / 2;
}

function apply(scrollBack, quiet = false) {
    document.querySelectorAll(".traced").forEach((e) => e.classList.remove("traced"));
    document.querySelectorAll(".traced-sec").forEach((e) => e.classList.remove("traced-sec"));
    const jump = document.getElementById("jump-data");
    if (!selected || backState().recordId !== selected.rec) {
        jump.hidden = true;
        return;
    }
    const { rec, path } = selected;

    // Front: the selected element and anything containing it. Its parts too, unless the screen shows
    // the value itself (an object's heading, say): then the heading is marked and its section tinted.
    const all = [...document.querySelectorAll(`#front .v[data-rec="${CSS.escape(rec)}"]`)];
    const exact = all.filter((e) => e.getAttribute("data-path") === path);
    const fronts = exact.length
        ? all.filter((e) => path === e.getAttribute("data-path") || path.startsWith(`${e.getAttribute("data-path")}/`))
        : all.filter((e) => related(e.getAttribute("data-path"), path));
    fronts.forEach((e) => e.classList.add("traced"));
    exact.filter((e) => e.parentElement.tagName === "H2").forEach((e) => {
        const sec = e.closest("section.sec");
        if (sec) sec.classList.add("traced-sec");
    });

    // JSON: the exact row, or its nearest ancestor that exists.
    let p = path;
    let row = null;
    while (p && !row) {
        row = document.querySelector(`#back .json [data-path="${CSS.escape(p)}"]`);
        if (!row) p = p.slice(0, p.lastIndexOf("/"));
    }
    if (row) row.classList.add("traced");
    const rows = [...document.querySelectorAll("#back table.explained tr[data-path]")]
        .filter((e) => related(e.getAttribute("data-path"), path));
    rows.forEach((e) => e.classList.add("traced"));

    const target = row || rows[0];
    const narrow = window.matchMedia("(max-width: 999px)").matches;
    jump.hidden = !(narrow && selected.from !== "back" && target && getView() === "split");
    if (target && !narrow && (scrollBack || (quiet && selected.from !== "back"))) {
        // Scroll the record within its own pane, never the page.
        scrollWithin(document.getElementById("back"), target);
    }
    if (selected.from === "back" && fronts[0]) {
        fronts[0].scrollIntoView({ block: "center", behavior: "auto" });
    }
}
