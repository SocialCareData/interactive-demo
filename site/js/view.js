// Which panes are showing: the system's screen, both side by side, or the record alone.

const VIEWS = ["screen", "split", "data"];

export function getView() {
    return document.body.dataset.view || "split";
}

/** Set the view. Stories pass persist:false so they don't overwrite the viewer's own choice. */
export function setView(view, { persist = true } = {}) {
    if (!VIEWS.includes(view)) return;
    document.body.dataset.view = view;
    for (const input of document.querySelectorAll('#viewswitch input[name="view"]')) {
        input.checked = input.value === view;
    }
    if (persist) {
        try { localStorage.setItem("view", view); } catch { /* storage unavailable */ }
    }
    document.dispatchEvent(new CustomEvent("view:changed", { detail: view }));
}

export function initView() {
    let saved = null;
    try { saved = localStorage.getItem("view"); } catch { /* storage unavailable */ }
    setView(VIEWS.includes(saved) ? saved : "split", { persist: false });
    document.getElementById("viewswitch").addEventListener("change", (ev) => {
        if (ev.target.name === "view") setView(ev.target.value);
    });
    document.addEventListener("keydown", (ev) => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target)) return;
        const i = ["1", "2", "3"].indexOf(ev.key);
        if (i >= 0) setView(VIEWS[i]);
    });
}

export function isTyping(t) {
    return !!t && (t.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName));
}
