const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const grid = document.getElementById("grid");
const previewSection = document.getElementById("previewSection");
const countEl = document.getElementById("count");
const clearBtn = document.getElementById("clearBtn");
const convertBtn = document.getElementById("convertBtn");
const loader = document.getElementById("loader");
const errorEl = document.getElementById("error");
const sortBtn = document.getElementById("sortBtn");

let items = []; // { id, file, url }
let nextId = 0;
let dragId = null;

function showError(msg) {
  errorEl.textContent = msg || "";
  errorEl.hidden = !msg;
}

function addFiles(fileList) {
  showError("");
  const images = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (images.length !== fileList.length) {
    showError("Alguns arquivos foram ignorados por não serem imagens.");
  }
  images.forEach((file) => {
    items.push({ id: nextId++, file, url: URL.createObjectURL(file), fresh: true });
  });
  render();
}

function removeItem(id) {
  const item = items.find((i) => i.id === id);
  if (item) URL.revokeObjectURL(item.url);
  items = items.filter((i) => i.id !== id);
  render();
}

function clearAll() {
  items.forEach((i) => URL.revokeObjectURL(i.url));
  items = [];
  showError("");
  render();
}

function moveItem(fromIdx, toIdx) {
  if (fromIdx === toIdx || toIdx < 0 || toIdx >= items.length) return;
  const [moved] = items.splice(fromIdx, 1);
  items.splice(toIdx, 0, moved);
  render();
}

function render() {
  grid.innerHTML = "";
  items.forEach((item, index) => {
    const el = document.createElement("div");
    el.className = "thumb" + (item.fresh ? " new" : "");
    el.draggable = true;
    item.fresh = false;

    const img = document.createElement("img");
    img.src = item.url;
    img.alt = item.file.name;
    img.loading = "lazy";

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = index + 1;

    const btn = document.createElement("button");
    btn.className = "remove";
    btn.type = "button";
    btn.title = "Remover";
    btn.setAttribute("aria-label", `Remover ${item.file.name}`);
    btn.textContent = "✕";
    btn.addEventListener("click", () => removeItem(item.id));

    const prev = document.createElement("button");
    prev.className = "move prev";
    prev.type = "button";
    prev.title = "Mover para antes";
    prev.setAttribute("aria-label", "Mover para antes");
    prev.textContent = "‹";
    prev.disabled = index === 0;
    prev.addEventListener("click", () => moveItem(index, index - 1));

    const next = document.createElement("button");
    next.className = "move next";
    next.type = "button";
    next.title = "Mover para depois";
    next.setAttribute("aria-label", "Mover para depois");
    next.textContent = "›";
    next.disabled = index === items.length - 1;
    next.addEventListener("click", () => moveItem(index, index + 1));

    // Arrastar e soltar para reordenar
    el.addEventListener("dragstart", (e) => {
      dragId = item.id;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(item.id));
      requestAnimationFrame(() => el.classList.add("dragging"));
    });
    el.addEventListener("dragend", () => {
      dragId = null;
      document.querySelectorAll(".thumb").forEach((t) => t.classList.remove("dragging", "drop-target"));
    });
    el.addEventListener("dragover", (e) => {
      if (dragId === null || dragId === item.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("drop-target");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
    el.addEventListener("drop", (e) => {
      if (dragId === null) return;
      e.preventDefault();
      e.stopPropagation();
      const from = items.findIndex((i) => i.id === dragId);
      moveItem(from, index);
    });

    el.append(img, idx, prev, next, btn);
    grid.appendChild(el);
  });

  countEl.textContent = items.length;
  previewSection.hidden = items.length === 0;
  convertBtn.disabled = items.length === 0;
}

// Dropzone
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = ""; // permite selecionar o mesmo arquivo novamente
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    if (dragId === null) dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  if (dragId === null) addFiles(e.dataTransfer.files);
});

// Evita que o navegador abra a imagem se soltar fora da dropzone
["dragover", "drop"].forEach((evt) =>
  window.addEventListener(evt, (e) => e.preventDefault())
);

clearBtn.addEventListener("click", clearAll);
sortBtn.addEventListener("click", () => {
  items.sort((a, b) =>
    a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: "base" })
  );
  render();
});

// Conversão
convertBtn.addEventListener("click", async () => {
  if (!items.length) return;
  showError("");

  const formData = new FormData();
  items.forEach((i) => formData.append("images", i.file, i.file.name));

  loader.hidden = false;
  convertBtn.disabled = true;

  try {
    const res = await fetch("/convert", { method: "POST", body: formData });

    if (!res.ok) {
      let msg = "Não foi possível gerar o PDF.";
      try { msg = (await res.json()).error || msg; } catch (_) {}
      throw new Error(msg);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "imagens.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    showError(err.message);
  } finally {
    loader.hidden = true;
    convertBtn.disabled = items.length === 0;
  }
});
