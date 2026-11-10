/* Shared helpers: dummy login, API wrapper, markdown renderer, character tooltip */

const Vault = (() => {
  const USER_KEY = "vault.username";

  function getUser() {
    try { return localStorage.getItem(USER_KEY); } catch { return null; }
  }
  function setUser(name) {
    try { localStorage.setItem(USER_KEY, name); } catch { /* private mode */ }
  }

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "X-User": getUser() || "" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error((data && data.error) || res.statusText), { status: res.status });
    return data;
  }

  /* ---------------- modal helpers ---------------- */
  function modal(html) {
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.innerHTML = `<div class="box">${html}</div>`;
    wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
    return wrap;
  }

  /* Demo accounts come from the database (db/02-seed.sql), so renaming them there is enough. */
  async function loadDemoAccounts(target) {
    try {
      const res = await fetch("/api/demo-accounts");
      if (!res.ok) throw new Error();
      const users = await res.json();
      if (!users.length) { target.closest(".field").remove(); return; }
      target.innerHTML = users.map((u) => {
        const roles = u.campaigns.map((c) => `${c.role === "gm" ? "GM" : "Player"} · ${esc(c.title)}`).join("<br>");
        return `<button type="button" class="btn sm ghost chip" data-demo="${esc(u.username)}">
                  <span>${esc(u.username)}</span><small>${roles || "no campaigns yet"}</small></button>`;
      }).join("");
    } catch {
      target.closest(".field").remove();
    }
  }

  function logout() {
    try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
    location.href = "/";
  }

  /* Login dialog. Resolves with the username, or null if the dialog was closed. */
  function askLogin(mode = "login") {
    return new Promise((resolve) => {
      const signup = mode === "signup";
      const current = getUser();
      const m = modal(`
        <form id="login-form" novalidate style="display:grid;gap:16px">
          <h2>${signup ? "Create your account" : "Log in"}</h2>
          ${current ? `<small>Currently logged in as <b>${esc(current)}</b></small>` : ""}
          <div class="field"><label for="login-name">Username (3–40 letters, numbers or _ · no password, demo only)</label>
            <input id="login-name" name="username" maxlength="40" autocomplete="username" placeholder="your_username" required></div>
          <div class="field"><span class="label-text">Demo accounts</span><div class="chips" id="demo-chips"><small>Loading…</small></div></div>
          <div class="form-error" id="login-error" role="alert"></div>
          <div class="row"><button type="button" class="btn sm ghost" id="login-cancel">Cancel</button>
            <button type="submit" class="btn sm" id="login-go">${signup ? "Sign Up" : "Enter the Vault"}</button></div>
        </form>`);
      const input = m.querySelector("#login-name");
      const errorBox = m.querySelector("#login-error");
      const goBtn = m.querySelector("#login-go");
      input.focus();

      const close = (value) => { m.remove(); resolve(value); };
      m.addEventListener("click", (e) => { if (e.target === m) resolve(null); });   // backdrop click
      m.querySelector("#login-cancel").onclick = () => close(null);

      async function submit() {
        errorBox.textContent = "";
        const username = input.value.trim().replace(/\s+/g, "_");
        if (!/^[A-Za-z0-9_]{3,40}$/.test(username)) {
          errorBox.textContent = "Use 3–40 letters, numbers or underscores.";
          input.focus();
          return;
        }
        goBtn.disabled = true;
        try {
          const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, signup }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
          setUser(data.username);
          close(data.username);
        } catch (err) {
          errorBox.textContent = err.message === "Failed to fetch"
            ? "Can't reach the server. Is `docker compose up` running?" : err.message;
          goBtn.disabled = false;
        }
      }
      m.querySelector("#login-form").addEventListener("submit", (e) => { e.preventDefault(); submit(); });
      m.querySelector("#demo-chips").addEventListener("click", (e) => {
        const b = e.target.closest("[data-demo]");
        if (b) { input.value = b.dataset.demo; submit(); }
      });
      loadDemoAccounts(m.querySelector("#demo-chips"));
    });
  }

  /* Pages that need a user: ask once, go back to the landing page if the dialog is closed. */
  async function requireUser() {
    const user = getUser() || (await askLogin());
    if (!user) { location.href = "/"; return new Promise(() => {}); }
    return user;
  }

  /* ---------------- markdown (safe: escape first, then format) ---------------- */
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeUrl = (u) => (/^(https?:\/\/|\/|#)/i.test(u) ? u : "#");

  function inline(text) {
    const codes = [];
    let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) => `<img alt="${alt}" src="${safeUrl(u)}">`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${t}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|[^_\w])_([^_]+)_/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function markdown(src = "") {
    const lines = esc(src.replace(/\r\n/g, "\n")).split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) {                                   // fenced code
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; out.push(`<pre><code>${buf.join("\n")}</code></pre>`); continue;
      }
      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); i++; continue; }
      if (/^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)[\s*_-]*$/.test(line)) { out.push("<hr>"); i++; continue; }
      if (/^&gt;\s?/.test(line)) {                               // blockquote
        const buf = [];
        while (i < lines.length && /^&gt;\s?/.test(lines[i])) buf.push(lines[i++].replace(/^&gt;\s?/, ""));
        out.push(`<blockquote>${markdown(buf.join("\n").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&amp;/g, "&"))}</blockquote>`);
        continue;
      }
      if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1])) { // table
        const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
        const head = cells(line); i += 2;
        const rows = [];
        while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${
          rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
        continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {                  // lists
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          let t = lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, "");
          const task = t.match(/^\[( |x|X)\]\s+(.*)$/);
          items.push(task
            ? `<li class="task"><input type="checkbox" disabled ${task[1] !== " " ? "checked" : ""}> ${inline(task[2])}</li>`
            : `<li>${inline(t)}</li>`);
        }
        out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|&gt;|\s*([-*+]|\d+\.)\s+|\|)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join("<br>"))}</p>`);
    }
    return out.join("\n");
  }

  /* ---------------- character card: hover popover (mouse) / bottom sheet (touch) ---------------- */
  const isTouch = () => matchMedia("(hover: none), (pointer: coarse)").matches;
  let card, backdrop;

  function hideCharCard() {
    if (card) { card.remove(); card = null; }
    if (backdrop) { backdrop.remove(); backdrop = null; }
  }

  function showCharCard(ch, anchor, { showPlayer = true, action = null, sheet = false } = {}) {
    hideCharCard();
    card = document.createElement("div");
    card.className = `char-card ${sheet ? "sheet" : ""}`;
    card.setAttribute("role", sheet ? "dialog" : "tooltip");
    const status = ch.kind === "PC"
      ? `<small class="${ch.online ? "online" : ""}">${ch.online ? "online" : "offline"}</small>` : "";
    const kindLabel = { PC: "PLAYER CHARACTER", NPC: "NON-PLAYER CHARACTER", MONSTER: "MONSTER" }[ch.kind];
    card.innerHTML = `
      <div class="kind">${kindLabel}</div>
      <h2>${esc(ch.name)}${status}</h2>
      <dl>
        ${ch.kind === "PC" && showPlayer ? `<dt>Player Name:</dt><dd>${esc(ch.player_name || "—")}</dd>` : ""}
        <dt>Race:</dt><dd>${esc(ch.race || "")}</dd>
        <dt>Class &amp; Level:</dt><dd>${esc(ch.class_level || "")}</dd>
        <dt>Age:</dt><dd>${esc(ch.age || "")}</dd>
      </dl>
      ${ch.quote ? `<div class="quote">“${esc(ch.quote)}”</div>` : ""}
      ${sheet ? `<div class="actions"><button type="button" class="btn sm ghost" data-close>Close</button>
        ${action ? `<button type="button" class="btn sm" data-act>${esc(action.label)}</button>` : ""}</div>` : ""}`;

    if (sheet) {
      backdrop = document.createElement("div");
      backdrop.className = "sheet-backdrop";
      backdrop.onclick = hideCharCard;
      document.body.appendChild(backdrop);
      document.body.appendChild(card);
      card.querySelector("[data-close]").onclick = hideCharCard;
      const act = card.querySelector("[data-act]");
      if (act) act.onclick = () => { hideCharCard(); action.run(); };
      (act || card.querySelector("[data-close]")).focus();
      return;
    }

    document.body.appendChild(card);
    const r = anchor.getBoundingClientRect();
    const w = card.offsetWidth, h = card.offsetHeight, pad = 16;
    let left = r.left + r.width / 2;
    if (left + w > innerWidth - pad) left = r.left - w - 8;                 // flip to the left of the avatar
    left = Math.max(pad, Math.min(left, innerWidth - w - pad));
    let top = r.top + r.height / 2;
    top = Math.max(pad, Math.min(top, innerHeight - h - pad));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  /* one call wires an avatar for both mouse and touch */
  function bindCharCard(button, ch, { showPlayer = true, action = null, onDirectClick = null } = {}) {
    button.addEventListener("mouseenter", () => !isTouch() && showCharCard(ch, button, { showPlayer }));
    button.addEventListener("mouseleave", () => !isTouch() && hideCharCard());
    button.addEventListener("focus", () => !isTouch() && button.matches(":focus-visible") && showCharCard(ch, button, { showPlayer }));
    button.addEventListener("blur", () => !isTouch() && hideCharCard());
    button.addEventListener("click", () => {
      if (isTouch()) showCharCard(ch, button, { showPlayer, action, sheet: true });
      else if (onDirectClick) onDirectClick();
    });
  }
  document.addEventListener("keydown", (e) => e.key === "Escape" && hideCharCard());
  addEventListener("scroll", () => card && !card.classList.contains("sheet") && hideCharCard(), { passive: true });

  function avatar(ch, extraClass = "") {
    const b = document.createElement("button");
    b.className = `avatar ${extraClass}`;
    b.type = "button";
    b.setAttribute("aria-label", ch.name);
    b.innerHTML = `<img src="${safeUrl(ch.image_url || "") === "#" ? "/static/img/avatar-placeholder.png" : esc(ch.image_url)}" alt="">`
      + (ch.kind === "PC" ? `<span class="dot ${ch.online ? "online" : "offline"}"></span>` : "");
    return b;
  }

  /* Role badge with the icon files from /static/img */
  function roleBadge(role) {
    const gm = role === "gm";
    return `<span class="badge ${gm ? "gm" : "player"}"><img class="badge-icon" src="/static/img/${gm ? "icon-crown.svg" : "icon-pawn.svg"}" alt="">${gm ? "Game Master" : "Player"}</span>`;
  }

  function fillHeader() {
    const u = getUser();
    document.querySelectorAll("[data-username]").forEach((el) => {
      el.textContent = u || "";
      el.title = "Switch account";
      el.setAttribute("aria-label", `Logged in as ${u}. Switch account`);
      el.onclick = () => confirm(`Log out ${u}?`) && logout();
    });
  }

  return { roleBadge, isTouch, bindCharCard, getUser, setUser, logout, api, modal, askLogin, requireUser, markdown, esc, showCharCard, hideCharCard, avatar, fillHeader };
})();
