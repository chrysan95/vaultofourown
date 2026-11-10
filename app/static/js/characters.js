/* Create-character modal shared by the pick page and the dashboard */
function openCharacterForm(campaignId, { kinds = ["PC"], onCreated } = {}) {
  const options = kinds.map((k) => `<option value="${k}">${{ PC: "PC (player character)", NPC: "NPC", MONSTER: "Monster" }[k]}</option>`).join("");
  const m = Vault.modal(`
    <h2>New character</h2>
    <div class="field ${kinds.length === 1 ? "hidden" : ""}"><label for="ch-kind">Type</label><select id="ch-kind">${options}</select></div>
    <div class="field"><label for="ch-name">Name</label><input id="ch-name" maxlength="80" placeholder="Character name"></div>
    <div class="field"><label for="ch-race">Race</label><input id="ch-race" maxlength="40"></div>
    <div class="field"><label for="ch-class">Class &amp; Level</label><input id="ch-class" maxlength="40"></div>
    <div class="field"><label for="ch-age">Age</label><input id="ch-age" maxlength="20"></div>
    <div class="field"><label for="ch-quote">Quote</label><input id="ch-quote" maxlength="160"></div>
    <div class="field"><label for="ch-img">Portrait URL (optional, placeholder used if empty)</label><input id="ch-img" placeholder="https://..."></div>
    <div class="row"><button class="btn sm ghost" id="ch-cancel">Cancel</button><button class="btn sm" id="ch-save">Create</button></div>`);
  const $ = (id) => m.querySelector(id);
  $("#ch-name").focus();
  $("#ch-cancel").onclick = () => m.remove();
  $("#ch-save").onclick = async () => {
    if (!$("#ch-name").value.trim()) return;
    const body = {
      kind: $("#ch-kind").value, name: $("#ch-name").value, race: $("#ch-race").value,
      class_level: $("#ch-class").value, age: $("#ch-age").value, quote: $("#ch-quote").value, image_url: $("#ch-img").value,
    };
    const ch = await Vault.api(`/api/campaigns/${campaignId}/characters`, { method: "POST", body });
    m.remove();
    onCreated && onCreated(ch);
  };
}
