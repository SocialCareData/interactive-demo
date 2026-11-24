// Example CMS: entry point and hash router.
//   #/                       home: front door and caseload
//   #/person/<council id>    person record and chronology
//   #/record/<kind>/<id>     any record
//   #/system/camhs[/<id>]    the second system: Anytown CAMHS
//   #/map  #/gaps  #/about

import { loadBundle, recByLocal, rec, store } from "./store.js";
import { h } from "./ui.js";
import { renderRecord } from "./records.js";
import { homeView, personView, camhsListView, camhsDetailView, gapsView, aboutView } from "./views.js";
import { setBack, render as renderBack } from "./back/pane.js";
import { renderMap } from "./map.js";
import { initTrace, clearTrace } from "./trace.js";

const front = document.getElementById("front");

function notFound(what) {
    return h("div", h("h1", "Not found"), h("p", `There's no ${what} in this demo.`), h("p", h("a", { href: "#/" }, "Back to the front door")));
}

function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [section, a, b] = hash.split("/").map(decodeURIComponent);
    document.body.classList.remove("map-full");
    clearTrace();
    let view;
    let nav = section || "home";

    if (!section) {
        view = homeView();
        setBack(null);
    } else if (section === "person") {
        const p = recByLocal("person", a);
        if (p) {
            view = personView(p);
            setBack(p.id, { mapScope: { type: "person", id: p.id } });
        } else view = notFound(`person ${a}`);
        nav = "home";
    } else if (section === "record") {
        const r = recByLocal(a, b);
        if (r) {
            view = renderRecord(r);
            setBack(r.id);
        } else view = notFound(`record ${a}/${b}`);
        nav = "home";
    } else if (section === "system" && a === "camhs") {
        const r = b ? recByLocal("request", b) : null;
        if (b && !r) view = notFound(`CAMHS referral ${b}`);
        else if (r) {
            view = camhsDetailView(r);
            setBack(r.id, { callout: "Same record, different system. Only the screen differs: this is exactly the data the council's system shows for this request." });
        } else {
            view = camhsListView();
            setBack(null);
        }
        nav = "camhs";
    } else if (section === "map") {
        document.body.classList.add("map-full");
        view = h("div", h("h1", "Map: how records link"),
            h("p.small.muted", "Every line is an identifier in one record pointing at another record, across organisations. Select a star to open that record."));
        const box = h("div");
        view.append(box);
        front.replaceChildren(view);
        renderMap(box, { scope: { type: "all" }, full: true });
        setNav("map");
        return;
    } else if (section === "gaps") {
        view = gapsView();
        setBack(null);
    } else if (section === "about") {
        view = aboutView();
        setBack(null);
    } else {
        view = notFound("page here");
    }
    front.replaceChildren(view);
    // The Explained tab orders rows by what the screen shows, so re-render it once the screen exists.
    renderBack();
    setNav(nav);
    window.scrollTo(0, 0);
    const heading = front.querySelector("h1, h2");
    if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
    }
    let t = "Example CMS";
    if (heading) {
        const copy = heading.cloneNode(true);
        copy.querySelectorAll(".tag").forEach((e) => e.remove());
        t = copy.textContent.replace(/\s+/g, " ").trim();
    }
    document.title = `${t} · Example CMS (fictional demo)`;
}

function setNav(current) {
    for (const a of document.querySelectorAll(".appnav a")) {
        a.toggleAttribute("aria-current", a.dataset.nav === current);
        if (a.dataset.nav === current) a.setAttribute("aria-current", "page");
    }
}

function badge() {
    const v = store.bundle.validation;
    const el = document.getElementById("badge");
    if (!v) {
        el.textContent = "Validation not run";
        return;
    }
    const sha = (store.bundle.meta.standardCommit || "").slice(0, 7);
    el.textContent = v.valid
        ? `✓ ${v.records} records valid against the standards (built from ${sha})`
        : `✗ ${v.problems} validation problem(s)`;
    el.classList.toggle("invalid", !v.valid);
}

async function start() {
    try {
        await loadBundle();
    } catch (err) {
        front.replaceChildren(h("div.not-std", h("strong", "Could not load the demo data. "), String(err.message || err)));
        return;
    }
    badge();
    initTrace();
    // The back pane sticks below the banner, whose height depends on how it wraps.
    const banner = document.querySelector(".banner");
    const setBannerHeight = () => document.documentElement.style.setProperty("--banner-h", `${banner.offsetHeight}px`);
    setBannerHeight();
    window.addEventListener("resize", setBannerHeight);
    window.addEventListener("hashchange", route);
    route();
}

start();
