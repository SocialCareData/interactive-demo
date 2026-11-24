// Example CMS: entry point and hash router.
//   #/                       welcome: where to start
//   #/people                 the people the council supports (the CMS home)
//   #/directory              services, professionals and organisations
//   #/person/<council id>    person record and chronology
//   #/record/<kind>/<id>     any record
//   #/system/camhs[/<id>]    the second system: Anytown CAMHS
//   #/story/<journey>/<n>    a step in a guided journey (opens one of the pages above)
//   #/map  #/gaps  #/about

import { loadBundle, recByLocal, store } from "./store.js";
import { h } from "./ui.js";
import { renderRecord } from "./records.js";
import {
    peopleView, directoryView, personView, camhsListView, camhsDetailView, gapsView, aboutView, welcomeView,
} from "./views.js";
import { setBack, render as renderBack } from "./back/pane.js";
import { renderMap } from "./map.js";
import { initTrace, clearTrace } from "./trace.js";
import { initView } from "./view.js";
import { initStory, enterStep, applyStep, leftStory } from "./story.js";

const front = document.getElementById("front");

function notFound(what) {
    return h("div.page-head", h("h1", "Not found"), h("p", `There's no ${what} in this demo. `, h("a", { href: "#/" }, "Go to the start"), "."));
}

/** Render one page from a path like "record/referral/REF-2026-0412". Returns the nav item. */
function renderPage(path) {
    const [section, a, b] = path.split("/").map(decodeURIComponent);
    document.body.classList.remove("page-full");
    clearTrace();
    let view;
    let nav = "people";
    let full = false;

    if (!section) {
        view = welcomeView();
        full = true;
        nav = "welcome";
        setBack(null);
    } else if (section === "people" || section === "front-door") {
        view = peopleView();
        full = true;
        nav = "people";
        setBack(null);
    } else if (section === "directory") {
        view = directoryView();
        full = true;
        nav = "directory";
        setBack(null);
    } else if (section === "person") {
        const p = recByLocal("person", a);
        if (p) {
            view = personView(p);
            setBack(p.id, { mapScope: { type: "person", id: p.id } });
        } else view = notFound(`person ${a}`);
    } else if (section === "record") {
        const r = recByLocal(a, b);
        if (r) {
            view = renderRecord(r);
            setBack(r.id);
        } else view = notFound(`record ${a}/${b}`);
    } else if (section === "system" && a === "camhs") {
        nav = "camhs";
        const r = b ? recByLocal("request", b) : null;
        if (b && !r) view = notFound(`CAMHS referral ${b}`);
        else if (r) {
            view = camhsDetailView(r);
            setBack(r.id, { callout: "Same record, different system. Only the screen differs: this is exactly the record the council's system shows for this request." });
        } else {
            view = camhsListView();
            full = true;
            setBack(null);
        }
    } else if (section === "map") {
        nav = "map";
        full = true;
        setBack(null);
        view = h("div",
            h("div.page-head", h("h1", "Every record, and how they link"),
                h("p", "Each point is a record. Each line is an identifier in one record pointing at another, across organisations. Select a point to open its record.")),
            h("div#fullmap"));
    } else if (section === "gaps") {
        view = gapsView();
        full = true;
        nav = "gaps";
        setBack(null);
    } else if (section === "about") {
        view = aboutView();
        full = true;
        nav = "about";
        setBack(null);
    } else {
        view = notFound("page here");
    }

    document.body.classList.toggle("page-full", full);
    front.replaceChildren(view);
    const fullmap = front.querySelector("#fullmap");
    if (fullmap) renderMap(fullmap, { scope: { type: "all" }, full: true });
    // The Explained tab orders rows by what the screen shows, so re-render it once the screen exists.
    renderBack();
    return nav;
}

function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    let nav;
    if (hash.startsWith("story/")) {
        const [, jid, n] = hash.split("/");
        const step = enterStep(jid, Number(n));
        if (!step) {
            front.replaceChildren(notFound(`step ${n} in “${jid}”`));
            return;
        }
        nav = renderPage(step.route.replace(/^#\/?/, ""));
        afterRender(nav);
        applyStep(step);
        return;
    }
    nav = renderPage(hash);
    afterRender(nav);
    leftStory();
}

function afterRender(nav) {
    for (const a of document.querySelectorAll(".appnav a")) {
        if (a.dataset.nav === nav) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
    }
    window.scrollTo(0, 0);
    const heading = front.querySelector("h1, h2");
    let t = "Example CMS";
    if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
        const copy = heading.cloneNode(true);
        copy.querySelectorAll(".tag").forEach((e) => e.remove());
        t = copy.textContent.replace(/\s+/g, " ").trim();
    }
    document.title = `${t}: Example CMS (a fictional demo)`;
}

function badge() {
    const v = store.bundle.validation;
    const el = document.getElementById("badge");
    if (!v) {
        el.textContent = "The records haven't been checked";
        return;
    }
    el.textContent = v.valid
        ? `All ${v.records} records are valid against the standards`
        : `${v.problems} records have problems against the standards`;
    el.classList.toggle("invalid", !v.valid);
}

async function start() {
    try {
        await loadBundle();
    } catch (err) {
        front.replaceChildren(h("div.page-head", h("h1", "The demo data didn't load"), h("p", String(err.message || err))));
        return;
    }
    badge();
    initView();
    initTrace();
    initStory();
    // The back pane sticks below the header, whose height depends on how it wraps.
    const head = document.querySelector(".site-head");
    const setStickyHeight = () => document.documentElement.style.setProperty("--sticky-h", `${head.offsetHeight}px`);
    setStickyHeight();
    window.addEventListener("resize", setStickyHeight);
    window.addEventListener("hashchange", route);
    route();
}

start();
