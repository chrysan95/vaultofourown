/* Home: list my campaigns, join by code, create a campaign */
(async () => {
  await Vault.requireUser();
  Vault.fillHeader();

  const cards = document.getElementById("cards");
  const errorBox = document.getElementById("join-error");
  const logo = "/static/img/logo.png";

  function campaignCard(c) {
    const a = document.createElement("a");
    a.className = "card";
    a.href = c.role === "gm" || c.character_id ? `/c/${c.id}` : `/c/${c.id}/pick`;
    a.innerHTML = `
      <div class="cover">
        ${Vault.roleBadge(c.role)}
        <img src="${logo}" alt="">
      </div>
      <div class="body"><h3>${Vault.esc(c.title)}</h3><small>by ${Vault.esc(c.owner)}</small></div>`;
    return a;
  }

  async function load() {
    cards.querySelectorAll(".card:not(.create)").forEach((n) => n.remove());
    const list = await Vault.api("/api/campaigns");
    list.forEach((c) => cards.appendChild(campaignCard(c)));
    // no blank filler cards: with no campaigns only "Create your new campaign" is shown
  }

  document.getElementById("join-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.textContent = "";
    try {
      const r = await Vault.api("/api/join", { method: "POST", body: { code: document.getElementById("join-code").value } });
      location.href = r.role === "gm" ? `/c/${r.campaign_id}` : `/c/${r.campaign_id}/pick`;
    } catch (err) { errorBox.textContent = err.message; }
  });

  function openCreate() {
    const m = Vault.modal(`
      <h2>New campaign</h2>
      <div class="field"><label for="new-title">Campaign title</label><input id="new-title" maxlength="120" placeholder="The whatever adventure"></div>
      <div class="row"><button class="btn sm ghost" id="cancel">Cancel</button><button class="btn sm" id="create">Create</button></div>`);
    const input = m.querySelector("#new-title"); input.focus();
    m.querySelector("#cancel").onclick = () => m.remove();
    const create = async () => {
      if (!input.value.trim()) return;
      const c = await Vault.api("/api/campaigns", { method: "POST", body: { title: input.value } });
      location.href = `/c/${c.id}`;
    };
    m.querySelector("#create").onclick = create;
    input.onkeydown = (e) => e.key === "Enter" && create();
  }
  document.getElementById("create-card").onclick = openCreate;
  if (location.hash === "#create") openCreate();

  load().catch((err) => { errorBox.textContent = err.message; });
})();
