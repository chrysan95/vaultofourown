/* In-site tabbed Markdown editor. Double-click a panel -> opens it as a tab here. */
const Editor = (() => {
  const tabs = [];            // { key, title, content, saved, readOnly, onSave }
  let active = null;
  let root;

  const TOOLS = [
    ["H1", "Heading 1", (s) => prefix(s, "# ")],
    ["H2", "Heading 2", (s) => prefix(s, "## ")],
    ["H3", "Heading 3", (s) => prefix(s, "### ")],
    "|",
    ["B", "Bold (Ctrl+B)", (s) => wrap(s, "**", "**", "bold")],
    ["I", "Italic (Ctrl+I)", (s) => wrap(s, "*", "*", "italic")],
    ["S", "Strikethrough", (s) => wrap(s, "~~", "~~", "strike")],
    ["</>", "Inline code", (s) => wrap(s, "`", "`", "code")],
    "|",
    ["•", "Bullet list", (s) => prefix(s, "- ")],
    ["1.", "Numbered list", (s) => prefix(s, "1. ")],
    ["☐", "Task list", (s) => prefix(s, "- [ ] ")],
    ["❝", "Quote", (s) => prefix(s, "> ")],
    "|",
    ["Link", "Link (Ctrl+K)", (s) => wrap(s, "[", "](https://)", "text")],
    ["Img", "Image", (s) => wrap(s, "![", "](https://)", "alt text")],
    ["{ }", "Code block", (s) => wrap(s, "```\n", "\n```", "code")],
    ["Table", "Table", (s) => insert(s, "\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n")],
    ["―", "Horizontal rule", (s) => insert(s, "\n---\n")],
  ];

  /* ---------- text helpers operating on the textarea selection ---------- */
  function wrap(ta, before, after, fallback) {
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const sel = value.slice(a, b) || fallback;
    ta.setRangeText(before + sel + after, a, b, "end");
    ta.setSelectionRange(a + before.length, a + before.length + sel.length);
  }
  function prefix(ta, mark) {
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const lineStart = value.lastIndexOf("\n", a - 1) + 1;
    const block = value.slice(lineStart, b);
    const numbered = mark === "1. ";
    const next = block.split("\n").map((l, i) => (numbered ? `${i + 1}. ` : mark) + l).join("\n");
    ta.setRangeText(next, lineStart, b, "end");
  }
  function insert(ta, text) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
  }

  /* ---------- DOM ---------- */
  function build() {
    root = document.createElement("section");
    root.className = "editor hidden";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Markdown editor");
    root.innerHTML = `
      <nav class="tabs"></nav>
      <div class="toolbar" role="toolbar" aria-label="Formatting"></div>
      <div class="view-switch" role="group" aria-label="View">
        <button type="button" data-view="write" aria-pressed="true">Write</button>
        <button type="button" data-view="preview" aria-pressed="false">Preview</button>
      </div>
      <div class="panes" data-view="write"><textarea spellcheck="true" aria-label="Markdown source"></textarea><div class="preview md" aria-label="Preview"></div></div>
      <footer class="footer"><span><span class="status" role="status"></span> <span class="kbd-hint">· Ctrl+S save · Esc back</span></span>
        <span class="actions"><button type="button" class="btn sm ghost" data-act="close">Close tab</button>
        <button type="button" class="btn sm" data-act="save">Save</button></span></footer>`;
    document.body.appendChild(root);

    const bar = root.querySelector(".toolbar");
    TOOLS.forEach((t) => {
      if (t === "|") { const s = document.createElement("span"); s.className = "sep"; bar.appendChild(s); return; }
      const [label, title, fn] = t;
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.title = title;
      b.onclick = () => { fn(textarea()); textarea().focus(); sync(); };
      bar.appendChild(b);
    });

    textarea().addEventListener("input", sync);
    textarea().addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "b") { e.preventDefault(); wrap(textarea(), "**", "**", "bold"); sync(); }
      if (mod && e.key === "i") { e.preventDefault(); wrap(textarea(), "*", "*", "italic"); sync(); }
      if (mod && e.key === "k") { e.preventDefault(); wrap(textarea(), "[", "](https://)", "text"); sync(); }
    });
    document.addEventListener("keydown", (e) => {
      if (root.classList.contains("hidden")) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
      if (e.key === "Escape") hide();
    });
    root.querySelector('[data-act="save"]').onclick = save;
    root.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
    root.querySelector('[data-act="close"]').onclick = () => close(active);
  }

  const textarea = () => root.querySelector("textarea");
  const current = () => tabs.find((t) => t.key === active);

  function renderTabs() {
    const nav = root.querySelector(".tabs");
    nav.innerHTML = "";
    tabs.forEach((t) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tab ${t.key === active ? "active" : ""}`;
      b.innerHTML = `<span>${Vault.esc(t.title)}${t.content !== t.saved ? " •" : ""}</span><span class="x" title="Close">✕</span>`;
      b.onclick = (e) => (e.target.classList.contains("x") ? close(t.key) : activate(t.key));
      nav.appendChild(b);
    });
    const spacer = document.createElement("span"); spacer.className = "spacer"; nav.appendChild(spacer);
    const min = document.createElement("button");
    min.type = "button"; min.className = "tab"; min.textContent = "Back to dashboard"; min.onclick = hide;
    nav.appendChild(min);
  }

  /* phones/tablets: one pane at a time (Write | Preview); ≥900px shows both side by side */
  function setView(view) {
    root.querySelector(".panes").dataset.view = view;
    root.querySelectorAll(".view-switch [data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
    if (view === "preview") preview();
  }

  function activate(key) {
    active = key;
    const t = current();
    const ro = t.readOnly;
    root.querySelector(".toolbar").classList.toggle("hidden", ro);
    root.querySelector(".panes").classList.toggle("read", ro);
    textarea().classList.toggle("hidden", ro);
    root.querySelector('[data-act="save"]').classList.toggle("hidden", ro);
    root.querySelector(".view-switch").classList.toggle("hidden", ro);
    setView(ro ? "preview" : "write");
    textarea().value = t.content;
    renderTabs(); preview();
    status(ro ? "Read only" : "Markdown");
    if (!ro && !Vault.isTouch()) textarea().focus();      // don't pop the phone keyboard straight away
  }

  function sync() {
    const t = current(); if (!t) return;
    t.content = textarea().value;
    preview(); renderTabs();
  }
  function preview() { root.querySelector(".preview").innerHTML = Vault.markdown(current().content); }
  function status(s) { root.querySelector(".status").textContent = s; }

  async function save() {
    const t = current();
    if (!t || t.readOnly) return;
    status("Saving…");
    try {
      await t.onSave(t.content);
      t.saved = t.content; renderTabs(); status("Saved ✓");
    } catch (err) { status(`Save failed: ${err.message}`); }
  }

  function close(key) {
    const i = tabs.findIndex((t) => t.key === key);
    if (i < 0) return;
    const t = tabs[i];
    if (t.content !== t.saved && !confirm(`Discard unsaved changes in "${t.title}"?`)) return;
    tabs.splice(i, 1);
    if (!tabs.length) { active = null; hide(); return; }
    activate(tabs[Math.max(0, i - 1)].key);
  }

  function hide() { root.classList.add("hidden"); document.documentElement.style.overflow = ""; }

  function open({ key, title, content, readOnly = false, onSave }) {
    if (!root) build();
    let t = tabs.find((x) => x.key === key);
    if (!t) { t = { key, title, content, saved: content, readOnly, onSave }; tabs.push(t); }
    root.classList.remove("hidden");
    document.documentElement.style.overflow = "hidden";       // lock page scroll behind the editor
    activate(key);
  }

  return { open };
})();
