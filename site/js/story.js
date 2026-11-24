// Guided journeys: the tour and one story per person (data/journeys.yaml, via the bundle).
//
// A step opens an ordinary page and sets it up. Then, rather than doing everything itself:
//  - a step with a task asks the viewer to do something ("Select the concern type"). The value is
//    outlined until they do. "Show me", or the → key, does it for them, so a presenter can still
//    just press →.
//  - the link to the next step is marked on the page (an entry in the timeline, the next entry in
//    the timeline strip, the other system's view), so following the story means using the page.
//  - open questions are linked from the bar, and stay closed until the viewer opens them.

import { h } from "./ui.js";
import { store } from "./store.js";
import { setView, isTyping } from "./view.js";
import { setXray, selectPath } from "./trace.js";
import { backState, setTab } from "./back/pane.js";

let active = null; // { journey, n, done }

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
    active = { journey, n, done: !step.task };
    return step;
}

/** Called by the router for any other page: keep the bar, but offer a way back. */
export function leftStory() {
    if (active) render(false);
}

export function exitStory() {
    if (!active) return;
    const step = currentStep();
    active = null;
    hideBar();
    if (location.hash.startsWith("#/story/")) location.hash = step.route;
}

function currentStep() {
    return active.journey.steps[active.n - 1];
}

function related(a, b) {
    return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function taskRecord(step) {
    return step.record || backState().recordId;
}

/** Set the page up as the step describes. The page itself has already been rendered. */
export function applyStep(step) {
    // Draw the bar first: it changes the height of the panes, and highlights scroll within them.
    render(true);
    setView(step.view || "split", { persist: false });
    setXray(!!step.xray, { persist: false });
    if (backState().recordId) setTab(step.tab || "data");
    if (step.trace && !step.task) selectPath(taskRecord(step), step.trace);
    if (step.task) promptFor(step);
    markNext();
}

/** Outline the value the viewer is asked to select. */
function promptFor(step) {
    const rec = taskRecord(step);
    const els = [...document.querySelectorAll(`#front .v[data-rec="${CSS.escape(rec)}"]`)]
        .filter((e) => related(e.getAttribute("data-path"), step.trace));
    els.forEach((e) => e.classList.add("story-prompt"));
    const first = els[0];
    if (first) {
        const r = first.getBoundingClientRect();
        if (r.top < 90 || r.bottom > window.innerHeight * 0.6) first.scrollIntoView({ block: "center" });
    }
}

function clearPrompts() {
    document.querySelectorAll(".story-prompt").forEach((e) => e.classList.remove("story-prompt"));
}

function showMe() {
    const step = currentStep();
    if (step.task) selectPath(taskRecord(step), step.trace);
}

function normRoute(href) {
    return (href || "").replace(/^#\/?/, "").replace(/\/timeline$/, "");
}

/** Mark the link on the page that leads to the next step, and point it at that step. */
function markNext() {
    const { journey, n } = active;
    const next = journey.steps[n];
    if (!next) return;
    const want = normRoute(next.route);
    const links = [...document.querySelectorAll("#front a[href]")].filter((a) => normRoute(a.getAttribute("href")) === want);
    const order = [".tl-strip", ".timeline", ".system-switch", ".people-list", ""];
    const target = order.map((sel) => links.find((a) => !sel || a.closest(sel))).find(Boolean);
    if (!target) return;
    target.classList.add("story-target");
    target.setAttribute("href", stepHref(journey.id, n + 1));
    target.setAttribute("title", `Next in the story: ${next.title}`);
}

function openGap(id) {
    const gap = document.querySelector(`#front details.gap[data-gap="${CSS.escape(id)}"]`);
    if (!gap) {
        location.hash = "#/gaps";
        return;
    }
    gap.open = true;
    gap.scrollIntoView({ block: "center" });
    gap.querySelector("summary").focus({ preventScroll: true });
}

function hideBar() {
    const bar = document.getElementById("story");
    bar.hidden = true;
    bar.replaceChildren();
    document.documentElement.style.setProperty("--story-h", "0px");
}

/** The tour ends where it ends. Each person's story leads on to the next person's. */
function nextJourney(journey) {
    if (journey.id === "tour") return null;
    const stories = journeys().filter((j) => j.id !== "tour");
    return stories[stories.indexOf(journey) + 1] || null;
}

function advance() {
    const { journey, n } = active;
    if (n < journey.steps.length) {
        location.hash = stepHref(journey.id, n + 1);
        return;
    }
    const after = nextJourney(journey);
    location.hash = after ? stepHref(after.id, 1) : "#/";
}

function render(onRoute) {
    const bar = document.getElementById("story");
    const { journey, n } = active;
    const step = currentStep();
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

    const gap = step.gap ? store.bundle.annotations.find((a) => a.id === step.gap) : null;
    const extra = h("div.story-extra",
        step.task
            ? (active.done
                ? h("span.story-task.done", "✓ ", step.task)
                : h("span.story-task", step.task, " ",
                    h("button.linklike", { type: "button", onclick: showMe }, "Show me")))
            : null,
        gap ? h("button.story-gap", { type: "button", onclick: () => openGap(gap.id) }, `◆ ${gap.id} ${gap.title}`) : null);

    const after = nextJourney(journey);
    const nextLabel = n < total ? "Next" : after ? `Next: ${after.title}` : journey.id === "tour" ? "Finish the tour" : "Back to the start";
    const controls = onRoute
        ? h("div.story-controls",
            n > 1 ? h("a", { href: stepHref(journey.id, n - 1) }, "Previous") : h("button", { type: "button", disabled: true }, "Previous"),
            h("button.next", { type: "button", onclick: advance }, nextLabel),
            h("button", {
                type: "button", "aria-pressed": String(collapsed),
                onclick: () => {
                    try { localStorage.setItem("storyCollapsed", collapsed ? "0" : "1"); } catch { /* storage unavailable */ }
                    render(true);
                },
            }, collapsed ? "Show text" : "Hide text"),
            h("button", { type: "button", onclick: exitStory }, "Leave"))
        : h("div.story-controls",
            h("a.next", { href: stepHref(journey.id, n) }, `Back to step ${n}`),
            h("button", { type: "button", onclick: exitStory }, "Leave"));

    bar.replaceChildren(h("div.story-inner",
        h("div",
            h("div.story-meta", h("strong", journey.title), h("span", `Step ${n} of ${total}`)),
            onRoute
                ? [h("h2.story-title", step.title), h("p.story-text", step.text.trim()), extra, dots]
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

    // A task is done when the viewer selects the value it asks for, wherever they select it.
    document.addEventListener("trace:selected", (ev) => {
        if (!active || active.done || !location.hash.startsWith("#/story/")) return;
        const step = currentStep();
        const { rec, path } = ev.detail;
        if (!step.task || rec !== taskRecord(step) || !related(path, step.trace)) return;
        active.done = true;
        clearPrompts();
        render(true);
    });

    document.addEventListener("keydown", (ev) => {
        if (!active || ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target)) return;
        if (!location.hash.startsWith("#/story/")) return;
        if (ev.key === "ArrowRight") {
            ev.preventDefault();
            // A presenter can just press →: the first press does the task, the next moves on.
            if (!active.done) showMe();
            else advance();
        } else if (ev.key === "ArrowLeft" && active.n > 1) {
            ev.preventDefault();
            location.hash = stepHref(active.journey.id, active.n - 1);
        } else if (ev.key === "Escape") {
            exitStory();
        }
    });
}
