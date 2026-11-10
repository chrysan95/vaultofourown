/* Landing: logo toggles the navbar, login/sign-up, quick join by code */
(() => {
  const menu = document.getElementById("brand-menu");
  const toggle = document.getElementById("menu-toggle");

  function setMenu(open) {
    menu.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  toggle.addEventListener("click", (e) => { e.stopPropagation(); setMenu(!menu.classList.contains("open")); });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  menu.querySelectorAll("a[href^='#']:not([data-login])").forEach((a) => a.addEventListener("click", () => setMenu(false)));

  // Log In / Sign Up always open the dialog (also lets you switch account)
  document.querySelectorAll("[data-login]").forEach((b) => b.addEventListener("click", async (e) => {
    e.preventDefault();
    setMenu(false);
    const user = await Vault.askLogin(b.dataset.login);
    if (user) location.href = "/home";
  }));

  document.querySelector("[data-create]").onclick = async () => {
    await Vault.requireUser();
    location.href = "/home#create";
  };

  document.querySelectorAll("[data-code]").forEach((input) => input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || !input.value.trim()) return;
    await Vault.requireUser();
    try {
      const r = await Vault.api("/api/join", { method: "POST", body: { code: input.value } });
      location.href = r.role === "gm" ? `/c/${r.campaign_id}` : `/c/${r.campaign_id}/pick`;
    } catch (err) {
      input.value = "";
      input.placeholder = err.message;
    }
  }));
})();
