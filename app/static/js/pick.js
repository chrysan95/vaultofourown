/* Pick your Character: players claim a PC (or create one) before entering the dashboard */
(async () => {
  await Vault.requireUser();
  Vault.fillHeader();
  const grid = document.getElementById("pick-grid");
  const errorBox = document.getElementById("pick-error");
  const id = grid.dataset.campaign;
  const me = Vault.getUser();

  async function claim(ch) {
    try {
      await Vault.api(`/api/campaigns/${id}/characters/${ch.id}/claim`, { method: "POST" });
      location.href = `/c/${id}`;
    } catch (err) { errorBox.textContent = err.message; }
  }

  async function load() {
    const lore = await Vault.api(`/api/campaigns/${id}/lore`);
    if (lore.role === "gm") { location.href = `/c/${id}`; return; }   // Game Masters don't pick a PC
    grid.innerHTML = "";
    document.getElementById("pick-hint").textContent = Vault.isTouch()
      ? "Tap a character to see them, or + to make your own."
      : "Hover a character to see them, click to play. Or + to make your own.";
    const chars = (await Vault.api(`/api/campaigns/${id}/characters`)).filter((c) => c.kind === "PC");
    chars.forEach((ch) => {
      const taken = ch.player_name && ch.player_name !== me;
      const b = Vault.avatar(ch, taken ? "taken" : "");
      if (taken) b.setAttribute("aria-disabled", "true");
      Vault.bindCharCard(b, ch, {
        showPlayer: false,
        // mouse: click picks straight away · touch: tap opens the card with a "Play as" button
        action: taken ? null : { label: `Play as ${ch.name}`, run: () => claim(ch) },
        onDirectClick: () => (taken ? (errorBox.textContent = `${ch.name} is played by ${ch.player_name}`) : claim(ch)),
      });
      grid.appendChild(b);
    });
    const add = document.createElement("button");
    add.className = "avatar add"; add.type = "button"; add.textContent = "+"; add.setAttribute("aria-label", "Create a character");
    add.onclick = () => openCharacterForm(id, { kinds: ["PC"], onCreated: claim });
    grid.appendChild(add);
  }

  load().catch((err) => {
    errorBox.textContent = err.status === 403 ? "Join this campaign with its code first." : err.message;
  });
})();
