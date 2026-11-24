// Guided journeys: the tour and one story per person (data/journeys.yaml, via the bundle).
// A step opens an ordinary page, then sets it up: view, back tab, field names, a highlighted
// value and an open question. The bar at the bottom says what to notice, and moves on.

import { h } from "./ui.js";
import { store } from "./store.js";
import { setView, isTyping } from "./view.js";
import { setXray, selectPath } from "./trace.js";
import { backState, setBack, setTab } from "./back/pane.js";

let active = null; // { journey, n }

export function journeys() {
    return store.bundle.journeys || [];
}

export function stepHref(jid, n) {
    return `#/story/${jid}/${n}`;
}

/** Called by the router for #/story/<id>/<n>. Returns the step, or null if there's no such step. */
export function enterStep(jid, n) {
    const journey = journeys().find((j) => j.id === jid);
    const step = journey && journey.steps[n - 1];
    if (!step) return null;
    active = { journey, n };
    return step;
}

/** Called by the router for any other page: keep the bar, but offer a way back. */
export function leftStory() {
    if (active) render(false);
}

export function exitStory() {
    if (!active) return;
    const step = active.journey.steps[active.n - 1];
    active = null;
    hideBar();
    if (location.hash.startsWith("#/story/")) location.hash = step.route;
}

/** Set the page up as the step describes. The page itself has already been rendered. */
export function applyStep(step) {
    // Draw the bar first: it changes the height of the panes, and the highlight scrolls within them.
    render(true);
    setView(step.view || "split", { persist: false });
    setXray(!!step.xray, { persist: false });
    const recordId = backState().recordId;
    if (step.map) {
        setBack(recordId, { mapScope: { type: step.map.scope, id: step.map.id }, callout: backState().callout });
        setTab("map");
    } else if (recordId) {
        setTab(step.tab || "data");
    }
    if (step.trace) selectPath(step.record || recordId, step.trace);
    if (step.gap) {
        const gap = document.querySelector(`#front details.gap[data-gap="${CSS.escape(step.gap)}"]`);
        // Open questions stay closed: the step brings the marker into view, and the viewer opens it.
        if (gap && !step.trace) gap.scrollIntoView({ block: "center" });
    }
}

function hideBar() {
    const bar = document.getElementById("story");
    bar.hidden = true;
    bar.replaceChildren();
    document.documentElement.style.setProperty("--story-h", "0px");
}

function nextJourney(journey) {
    const list = journeys();
    return list[list.indexOf(journey) + 1] || null;
}

function render(onRoute) {
    const bar = document.getElementById("story");
    const { journey, n } = active;
    const step = journey.steps[n - 1];
    const total = journey.steps.length;
    // On a phone the bar starts with its text hidden, unless the viewer has chosen otherwise.
    let collapsed = window.matchMedia("(max-width: 700px)").matches;
    try {
        const saved = localStorage.getItem("storyCollapsed");
        if (saved !== null) collapsed = saved === "1";
    } catch { /* storage unavailable */ }

    const dots = h("div.story-dots", { "aria-label": "Steps" },
        journey.steps.map((s, i) => h("a", {
            href: stepHref(journey.id, i + 1),
            class: i + 1 < n ? "done" : undefined,
            "aria-current": i + 1 === n ? "step" : undefined,
            "aria-label": `Step ${i + 1}: ${s.title}`,
            title: `Step ${i + 1}: ${s.title}`,
        })));

    const after = nextJourney(journey);
    const next = n < total
        ? h("a.next", { href: stepHref(journey.id, n + 1) }, "Next")
        : after
            ? h("a.next", { href: stepHref(after.id, 1) }, `Next: ${after.title}`)
            : h("a.next", { href: "#/" }, "Back to the start");

    const controls = onRoute
        ? h("div.story-controls",
            n > 1 ? h("a", { href: stepHref(journey.id, n - 1) }, "Previous") : h("button", { type: "button", disabled: true }, "Previous"),
            next,
            h("button", {
                type: "button", "aria-pressed": String(collapsed),
                onclick: () => {
                    try { localStorage.setItem("storyCollapsed", collapsed ? "0" : "1"); } catch { /* storage unavailable */ }
                    render(true);
                },
            }, collapsed ? "Show text" : "Hide text"),
            h("button", { type: "button", onclick: exitStory }, "Leave story"))
        : h("div.story-controls",
            h("a.next", { href: stepHref(journey.id, n) }, `Back to step ${n}`),
            h("button", { type: "button", onclick: exitStory }, "Leave story"));

    bar.replaceChildren(h("div.story-inner",
        h("div",
            h("div.story-meta", h("strong", journey.title), h("span", `Step ${n} of ${total}`)),
            onRoute
                ? [h("h2.story-title", step.title), h("p.story-text", step.text.trim()), dots]
                : [h("h2.story-title", "You're exploring on your own"),
                    h("p.story-text", `The story is paused at step ${n}, “${step.title}”. Go back to it, or leave the story and keep exploring.`)]),
        controls));
    bar.classList.toggle("collapsed", onRoute && collapsed);
    bar.classList.toggle("offroute", !onRoute);
    bar.hidden = false;
    sizeBar();
}

function sizeBar() {
    const bar = document.getElementById("story");
    document.documentElement.style.setProperty("--story-h", bar.hidden ? "0px" : `${bar.offsetHeight}px`);
}

export function initStory() {
    const bar = document.getElementById("story");
    if ("ResizeObserver" in window) new ResizeObserver(sizeBar).observe(bar);
    document.addEventListener("keydown", (ev) => {
        if (!active || ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target)) return;
        if (!location.hash.startsWith("#/story/")) return;
        const { journey, n } = active;
        if (ev.key === "ArrowRight") {
            ev.preventDefault();
            const after = nextJourney(journey);
            if (n < journey.steps.length) location.hash = stepHref(journey.id, n + 1);
            else location.hash = after ? stepHref(after.id, 1) : "#/";
        } else if (ev.key === "ArrowLeft" && n > 1) {
            ev.preventDefault();
            location.hash = stepHref(journey.id, n - 1);
        } else if (ev.key === "Escape") {
            exitStory();
        }
    });
}
