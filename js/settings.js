import { addTemplate, deleteBike, deleteTemplate, getData, saveBike, setDragSettings, setUnit, setUseMotionSensor } from "./storage.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

export function initSettings(openModal, showToast, onChange) {
  function render() {
    const { bikes, templates, unit, useMotionSensor, splitDistances, oneFootRollout } = getData();
    document.getElementById("bikeList").innerHTML = bikes.length ? bikes.map((bike) => `<div class="setting-row"><button class="button setting-row-main edit-bike" data-id="${bike.id}" type="button"><strong>${escapeHtml(bike.name)}</strong><span>${escapeHtml([bike.brand, bike.cc ? `${bike.cc} cc` : "", bike.power ? `${bike.power} hp` : ""].filter(Boolean).join(" · ") || "Profil motor")}</span></button><button class="delete-button delete-bike" data-id="${bike.id}" type="button" aria-label="Hapus ${escapeHtml(bike.name)}">×</button></div>`).join("") : `<div class="settings-empty">Belum ada profil. Tambahkan motor untuk memilihnya saat uji.</div>`;
    document.getElementById("templateList").innerHTML = templates.filter((template) => template.type === "distance").map((template) => `<div class="setting-row"><div class="setting-row-main"><strong>${escapeHtml(template.name)}</strong><span>Target jarak: ${template.target} m</span></div>${template.builtIn ? `<span class="stock-tag">BAWAAN</span>` : `<button class="delete-button delete-template" data-id="${template.id}" type="button" aria-label="Hapus ${escapeHtml(template.name)}">×</button>`}</div>`).join("");
    document.querySelectorAll("[data-unit]").forEach((button) => button.classList.toggle("selected", button.dataset.unit === unit));
    const motionToggle = document.getElementById("useMotionSensor");
    motionToggle.checked = useMotionSensor !== false;
    document.getElementById("settingsRollout").checked = oneFootRollout !== false;
    document.getElementById("dragRollout").checked = oneFootRollout !== false;
    document.getElementById("splitDistanceCount").textContent = `${splitDistances.length} / 8`;
    document.getElementById("splitDistanceList").innerHTML = splitDistances.map((distance, index) => `<div class="setting-row split-distance-row"><div class="setting-row-main"><strong>${distance} m</strong><span>SPLIT ${String(index + 1).padStart(2, "0")}</span></div><div class="split-distance-actions"><button class="split-order-button" data-split-move="${index},-1" type="button" aria-label="Pindah ${distance} meter ke atas" ${index === 0 ? "disabled" : ""}>↑</button><button class="split-order-button" data-split-move="${index},1" type="button" aria-label="Pindah ${distance} meter ke bawah" ${index === splitDistances.length - 1 ? "disabled" : ""}>↓</button><button class="delete-button delete-split" data-split-delete="${distance}" type="button" aria-label="Hapus split ${distance} meter">×</button></div></div>`).join("");
    document.getElementById("addSplitDistance").disabled = splitDistances.length >= 8;
    document.querySelectorAll("[data-split-distance]").forEach((button) => {
      button.disabled = splitDistances.length >= 8 || splitDistances.includes(Number(button.dataset.splitDistance));
    });
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
    openModal({ kicker: "DRAG METER / TEMPLATE", title: "Template Jarak Baru", content: `<form id="templateForm" class="sheet-form"><label>Nama template<input name="name" required maxlength="40" placeholder="Contoh: 0 - 300 meter"></label><label>Nilai target (meter)<input name="target" type="number" required min="1" max="10000" inputmode="numeric" placeholder="300"></label><button class="button button-primary" type="submit">SIMPAN TEMPLATE</button></form>` });
    document.getElementById("templateForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      addTemplate({ name: fields.get("name").trim(), type: "distance", target: Number(fields.get("target")) });
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
  function updateDragSettings(changes) {
    setDragSettings(changes);
    render();
    onChange();
  }
  document.getElementById("settingsRollout").addEventListener("change", (event) => {
    updateDragSettings({ oneFootRollout: event.currentTarget.checked });
  });
  document.getElementById("splitDistanceList").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-split-delete]");
    const move = event.target.closest("[data-split-move]");
    const current = getData().splitDistances;
    if (remove) {
      updateDragSettings({ splitDistances: current.filter((value) => value !== Number(remove.dataset.splitDelete)) });
    } else if (move) {
      const [index, offset] = move.dataset.splitMove.split(",").map(Number);
      const target = index + offset;
      if (target < 0 || target >= current.length) return;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      updateDragSettings({ splitDistances: reordered });
    }
  });
  function addSplitDistance(value) {
    const distance = Number(value);
    const current = getData().splitDistances;
    if (!Number.isFinite(distance) || distance <= 0) return showToast("Jarak split harus lebih besar dari 0 m.");
    if (current.includes(distance)) return showToast("Jarak split tersebut sudah ada.");
    if (current.length >= 8) return showToast("Maksimal 8 jarak split.");
    updateDragSettings({ splitDistances: [...current, distance] });
  }
  document.getElementById("addSplitDistance").addEventListener("click", () => {
    const input = document.getElementById("customSplitDistance");
    addSplitDistance(input.value);
    input.value = "";
  });
  document.querySelectorAll("[data-split-distance]").forEach((button) => button.addEventListener("click", () => {
    addSplitDistance(button.dataset.splitDistance);
  }));
  document.getElementById("dragRollout").addEventListener("change", (event) => {
    updateDragSettings({ oneFootRollout: event.currentTarget.checked });
  });
  render();
  return { render };
}
