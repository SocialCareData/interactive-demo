// The person's timeline, in miniature, at the top of each of their records: where this record sits
// in their story, and a way to step to the entries before and after it.

import { h, fmtDate } from "./ui.js";
import { peopleFor, recordsAboutPerson, recDate, route, title, councilId, KIND_LABEL } from "./store.js";
import { summary } from "./views.js";

export function timelineStrip(r) {
    const person = peopleFor(r)[0];
    if (!person) return null;
    const entries = recordsAboutPerson(person.id)
        .sort((a, b) => (recDate(a) || "").localeCompare(recDate(b) || ""));
    const i = entries.findIndex((x) => x.id === r.id);
    if (i < 0) return null;
    const prev = entries[i - 1];
    const next = entries[i + 1];
    const name = title(person);
    return h("nav.tl-strip", { "aria-label": `${name}'s timeline` },
        h("div.tl-strip-head",
            h("a", { href: `#/person/${councilId(person)}/timeline` }, `${name}'s timeline`),
            h("span.muted", `Entry ${i + 1} of ${entries.length}`)),
        h("ol.tl-dots",
            entries.map((x, j) => h("li",
                h(`a.tl-dot.k-${x.kind}`, {
                    href: route(x),
                    "aria-current": j === i ? "step" : undefined,
                    title: `${fmtDate(recDate(x))}: ${summary(x)}`,
                    "aria-label": `${fmtDate(recDate(x))}, ${KIND_LABEL[x.kind]}: ${summary(x)}`,
                })))),
        h("div.tl-strip-nav",
            prev ? h("a", { href: route(prev), title: summary(prev) }, "Earlier entry") : h("span.muted", "Earliest entry"),
            next ? h("a", { href: route(next), title: summary(next) }, "Later entry") : h("span.muted", "Latest entry")));
}
