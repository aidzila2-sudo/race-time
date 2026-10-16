import { addTemplate, deleteBike, deleteTemplate, getData, saveBike, setUnit, setUseMotionSensor } from "./storage.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

export function initSettings(openModal, showToast, onChange) {
  function render() {
    const { bikes, templates, unit, useMotionSensor } = getData();
    document.getElementById("bikeList").innerHTML = bikes.length ? bikes.map((bike) => `<div class="setting-row"><button class="button setting-row-main edit-bike" data-id="${bike.id}" type="button"><strong>${escapeHtml(bike.name)}</strong><span>${escapeHtml([bike.brand, bike.cc ? `${bike.cc} cc` : "", bike.power ? `${bike.power} hp` : ""].filter(Boolean).join(" · ") || "Profil motor")}</span></button><button class="delete-button delete-bike" data-id="${bike.id}" type="button" aria-label="Hapus ${escapeHtml(bike.name)}">×</button></div>`).join("") : `<div class="settings-empty">Belum ada profil. Tambahkan motor untuk memilihnya saat uji.</div>`;
    document.getElementById("templateList").innerHTML = templates.map((template) => `<div class="setting-row"><div class="setting-row-main"><strong>${escapeHtml(template.name)}</strong><span>${template.type === "speed" ? `KECEPATAN · ${template.target} km/j` : `JARAK · ${template.target} m`}</span></div>${template.builtIn ? `<span class="stock-tag">BAWAAN</span>` : `<button class="delete-button delete-template" data-id="${template.id}" type="button" aria-label="Hapus ${escapeHtml(template.name)}">×</button>`}</div>`).join("");
    document.querySelectorAll("[data-unit]").forEach((button) => button.classList.toggle("selected", button.dataset.unit === unit));
    const motionToggle = document.getElementById("useMotionSensor");
    motionToggle.checked = useMotionSensor !== false;
  }

  function bikeForm(bike = {}) {
    openModal({ kicker: "GARASI / PROFIL MOTOR", title: bike.id ? "Edit Motor" : "Tambah Motor", content: `<form id="bikeForm" class="sheet-form"><label>Nama motor<input name="name" required maxlength="40" placeholder="Contoh: R15 V4" value="${escapeHtml(bike.name || "")}"></label><label>Merek<input name="brand" maxlength="40" placeholder="Yamaha" value="${escapeHtml(bike.brand || "")}"></label><div class="form-grid"><label>Kapasitas (cc)<input name="cc" type="number" min="0" max="5000" inputmode="numeric" placeholder="155" value="${escapeHtml(bike.cc || "")}"></label><label>Tenaga (hp)<input name="power" type="number" min="0" max="1000" step="0.1" inputmode="decimal" placeholder="19" value="${escapeHtml(bike.power || "")}"></label></div><label>Berat (kg)<input name="weight" type="number" min="0" max="2000" step="0.1" inputmode="decimal" placeholder="141" value="${escapeHtml(bike.weight || "")}"></label><button class="button button-primary" type="submit">SIMPAN PROFIL</button></form>` });
    document.getElementById("bikeForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      saveBike({ id: bike.id, name: fields.get("name").trim(), brand: fields.get("brand").trim(), cc: fields.get("cc"), power: fields.get("power"), weight: fields.get("weight") });
      render();
      onChange();
      document.getElementById("modalBackdrop").classList.add("hidden");
      showToast("Profil motor tersimpan.");
    });
  }

  function templateForm() {
    openModal({ kicker: "DRAG METER / TEMPLATE", title: "Template Baru", content: `<form id="templateForm" class="sheet-form"><label>Nama template<input name="name" required maxlength="40" placeholder="Contoh: 0-80 km/j"></label><label>Jenis pengujian<select name="type"><option value="speed">Kecepatan (km/j)</option><option value="distance">Jarak (meter)</option></select></label><label>Target<input name="target" type="number" required min="1" max="10000" inputmode="numeric" placeholder="80"></label><button class="button button-primary" type="submit">SIMPAN TEMPLATE</button></form>` });
    document.getElementById("templateForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const type = fields.get("type");
      addTemplate({ name: fields.get("name").trim(), type, target: Number(fields.get("target")) });
      render();
      onChange();
      document.getElementById("modalBackdrop").classList.add("hidden");
      showToast("Template uji tersimpan.");
    });
  }

  document.getElementById("addBike").addEventListener("click", () => bikeForm());
  document.getElementById("addTemplate").addEventListener("click", templateForm);
  document.getElementById("bikeList").addEventListener("click", (event) => {
    const edit = event.target.closest(".edit-bike");
    const remove = event.target.closest(".delete-bike");
    if (edit) bikeForm(getData().bikes.find((bike) => bike.id === edit.dataset.id));
    if (remove && window.confirm("Hapus profil motor ini?")) {
      deleteBike(remove.dataset.id);
      render();
      onChange();
      showToast("Profil motor dihapus.");
    }
  });
  document.getElementById("templateList").addEventListener("click", (event) => {
    const remove = event.target.closest(".delete-template");
    if (remove && window.confirm("Hapus template uji ini?")) {
      deleteTemplate(remove.dataset.id);
      render();
      onChange();
      showToast("Template uji dihapus.");
    }
  });
  document.querySelectorAll("[data-unit]").forEach((button) => button.addEventListener("click", () => {
    setUnit(button.dataset.unit);
    render();
    onChange();
  }));
  document.getElementById("useMotionSensor").addEventListener("change", (event) => {
    setUseMotionSensor(event.currentTarget.checked);
    showToast(event.currentTarget.checked ? "Sensor gerak eksperimental diaktifkan." : "Sensor gerak dinonaktifkan.");
  });
  render();
  return { render };
}
