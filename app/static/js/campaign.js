/* Campaign dashboard */
(async () => {
  await Vault.requireUser();
  Vault.fillHeader();

  const dash = document.getElementById("main");
  const id = dash.dataset.campaign;
  const $ = (s) => document.getElementById(s);
  const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
  let lore, isGM;

  /* ---------- lore ---------- */
  async function loadLore() {
    try {
      lore = await Vault.api(`/api/campaigns/${id}/lore`);
    } catch (err) {
      if (err.status === 403) { location.href = "/home"; return false; }
      throw err;
    }
    isGM = lore.role === "gm";
    if (!isGM && !lore.character_id) { location.href = `/c/${id}/pick`; return false; }

    dash.classList.toggle("player", !isGM);             // switches the grid layout (no notes column)
    document.title = `${lore.title} · Vault of Our Own`;
    $("c-title").textContent = lore.title;
    $("c-owner").textContent = lore.owner;
    $("c-code").innerHTML = isGM ? ` · code <code>${Vault.esc(lore.code)}</code>` : "";
    $("role-badge").innerHTML = isGM
      ? Vault.roleBadge("gm") : Vault.roleBadge("player");

    $("summary").innerHTML = Vault.markdown(lore.summary) || '<span class="empty">No summary yet.</span>';

    // notes: GM only (the API never sends them to players)
    $("notes-wrap").classList.toggle("hidden", !isGM);
    if (isGM) $("notes").innerHTML = Vault.markdown(lore.notes) || '<span class="empty">Open to write private notes.</span>';

    // map: GM always sees it + toggle; players only when shared
    $("map-toggle-wrap").classList.toggle("hidden", !isGM);
    $("map-set").classList.toggle("hidden", !isGM);
    $("map-toggle").checked = !!lore.map_public;
    $("map-section").classList.toggle("hidden", !(isGM || lore.map_public));
    $("map-img").src = lore.map_url || "/static/img/map-placeholder.svg";
    return true;
  }

  const saveField = (field) => async (value) => {
    await Vault.api(`/api/campaigns/${id}/lore`, { method: "PATCH", body: { [field]: value } });
    await loadLore();
  };

  const openers = {
    summary: () => Editor.open({ key: "summary", title: "Summary", content: lore.summary, readOnly: !isGM, onSave: saveField("summary") }),
    notes: () => isGM && Editor.open({ key: "notes", title: "GM Notes", content: lore.notes, onSave: saveField("notes") }),
  };
  Object.entries(openers).forEach(([key, open]) => {
    $(key).addEventListener("dblclick", open);                                  // mouse
    $(key).addEventListener("keydown", (e) => e.key === "Enter" && open());     // keyboard
  });
  document.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openers[b.dataset.open]())); // touch

  $("map-toggle").addEventListener("change", (e) => saveField("map_public")(e.target.checked));
  $("map-set").addEventListener("click", () => {
    const m = Vault.modal(`
      <h2>Campaign map</h2>
      <div class="field"><label for="map-url">Image URL (leave empty for the placeholder)</label>
        <input id="map-url" type="url" inputmode="url" value="${Vault.esc(lore.map_url || "")}"></div>
      <div class="row"><button class="btn sm ghost" id="mc" type="button">Cancel</button><button class="btn sm" id="ms" type="button">Save</button></div>`);
    m.querySelector("#mc").onclick = () => m.remove();
    m.querySelector("#ms").onclick = async () => { await saveField("map_url")(m.querySelector("#map-url").value.trim()); m.remove(); };
  });

  /* ---------- roster ---------- */
  async function loadRoster() {
    const chars = await Vault.api(`/api/campaigns/${id}/characters`);
    const groups = { PC: $("pcs"), NPC: $("npcs"), MONSTER: $("monsters") };
    Object.values(groups).forEach((g) => (g.innerHTML = ""));
    $("monsters-wrap").classList.toggle("hidden", !isGM);

    chars.forEach((ch) => {
      const mine = ch.kind === "PC" && ch.id === lore.character_id;
      const b = Vault.avatar(ch, mine ? "mine" : "");
      Vault.bindCharCard(b, ch);
      groups[ch.kind].appendChild(b);
    });

    if (isGM) {
      [["PC", "pcs"], ["NPC", "npcs"], ["MONSTER", "monsters"]].forEach(([kind, el]) => {
        const add = document.createElement("button");
        add.className = "avatar add"; add.type = "button"; add.textContent = "+";
        add.setAttribute("aria-label", `Add ${kind === "MONSTER" ? "monster" : kind}`);
        add.onclick = () => openCharacterForm(id, { kinds: [kind], onCreated: loadRoster });
        $(el).appendChild(add);
      });
    }
  }

  /* ---------- dice ---------- */
  DICE.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = d; b.setAttribute("aria-label", `Roll a ${d}`);
    b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await Vault.api(`/api/campaigns/${id}/roll`, { method: "POST", body: { dice: d } });
        $("roll-result").textContent = `${r.result}`;
        $("roll-result").title = `${r.dice} → ${r.result}`;
        loadFeed();
      } finally { b.disabled = false; }
    };
    $("dice-row").appendChild(b);
  });

  async function loadFeed() {
    const rows = await Vault.api(`/api/campaigns/${id}/recent-rolls`);
    $("feed").innerHTML = rows.length
      ? rows.map((r) => `<div class="feed-item"><span>${Vault.esc(r.username)} · ${Vault.esc(r.dice)}</span><b>${r.result}</b></div>`).join("")
      : '<span class="empty">No rolls yet. Pick a die.</span>';
  }

  /* ---------- presence (PC online status) ---------- */
  const beat = (online = true) => fetch(`/api/campaigns/${id}/presence`, {
    method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json", "X-User": Vault.getUser() },
    body: JSON.stringify({ online }),
  }).catch(() => {});
  addEventListener("pagehide", () => beat(false));
  document.addEventListener("visibilitychange", () => beat(document.visibilityState === "visible"));

  /* ---------- boot ---------- */
  if (!(await loadLore())) return;
  await beat(true);
  await Promise.all([loadRoster(), loadFeed()]);
  setInterval(() => { if (document.visibilityState === "visible") beat(true); }, 20000);
  setInterval(() => {
    if (document.visibilityState !== "visible") return;           // don't poll from background tabs
    if (!document.querySelector(".a-roster:hover, .char-card")) loadRoster();
    loadFeed();
  }, 10000);
})();
