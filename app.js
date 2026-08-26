const fileInput = document.getElementById("file-input");
const addPhotoBtn = document.getElementById("add-photo-btn");
const EXTRA_KEY = "gallery:extra-ids";
let currentTarget = null;
let currentShape = null;
let addingNewSlot = false;

const PALETTES = {
  "cover-photo": ["#8b5cf6", "#ff6fa5"],
  "avatar-photo": ["#ffb347", "#ff6fa5"],
  "photo-1": ["#8b5cf6", "#60a5fa"],
  "photo-2": ["#ff6fa5", "#ffb347"],
  "photo-3": ["#34d399", "#60a5fa"],
  "photo-4": ["#f472b6", "#a78bfa"],
  "photo-5": ["#fbbf24", "#fb7185"],
  "photo-6": ["#818cf8", "#f472b6"],
};

function placeholderDataUrl(id) {
  const [c1, c2] = PALETTES[id] || ["#8b5cf6", "#ff6fa5"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#g)"/>
    <text x="50%" y="50%" font-size="90" text-anchor="middle" dominant-baseline="middle" fill="rgba(255,255,255,0.85)">📷</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function applyImage(id, url) {
  const el = document.getElementById(id);
  if (el) el.style.backgroundImage = `url("${url}")`;
}

function loadImage(id) {
  const saved = localStorage.getItem(`photo:${id}`);
  applyImage(id, saved || placeholderDataUrl(id));
  document.getElementById(id)?.classList.toggle("has-image", !!saved);
}

function getExtraIds() {
  try {
    return JSON.parse(localStorage.getItem(EXTRA_KEY)) || [];
  } catch {
    return [];
  }
}

function saveExtraIds(ids) {
  localStorage.setItem(EXTRA_KEY, JSON.stringify(ids));
}

function createGallerySlot(id) {
  const card = document.createElement("div");
  card.className = "photo-card";
  card.id = id;

  const btn = document.createElement("button");
  btn.className = "edit-btn edit-btn-gallery";
  btn.dataset.target = id;
  btn.dataset.shape = "gallery";
  btn.textContent = "📷 이미지 추가하기";

  card.appendChild(btn);
  addPhotoBtn.before(card);
  return card;
}

function initPhotos() {
  Object.keys(PALETTES).forEach(loadImage);
  getExtraIds().forEach((id) => {
    createGallerySlot(id);
    loadImage(id);
  });
}

function resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 읽을 수 없습니다"));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          } else {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".edit-btn[data-target]");
  if (!btn) return;
  currentTarget = btn.dataset.target;
  currentShape = btn.dataset.shape;
  addingNewSlot = false;
  fileInput.value = "";
  fileInput.click();
});

addPhotoBtn.addEventListener("click", () => {
  addingNewSlot = true;
  currentShape = "gallery";
  fileInput.value = "";
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file || (!currentTarget && !addingNewSlot)) return;

  const maxSize = currentShape === "cover" ? 1200 : currentShape === "avatar" ? 400 : 800;

  try {
    const dataUrl = await resizeImage(file, maxSize);

    if (addingNewSlot) {
      const extraIds = getExtraIds();
      const newId = `photo-${7 + extraIds.length}`;
      createGallerySlot(newId);
      extraIds.push(newId);
      saveExtraIds(extraIds);
      currentTarget = newId;
      addingNewSlot = false;
    }

    applyImage(currentTarget, dataUrl);
    localStorage.setItem(`photo:${currentTarget}`, dataUrl);
    document.getElementById(currentTarget)?.classList.add("has-image");
  } catch (err) {
    alert("사진을 불러오지 못했어요. 다른 사진으로 시도해보세요.");
  }
});

const contextMenu = document.getElementById("context-menu");
let menuTargetId = null;

function closeContextMenu() {
  contextMenu.hidden = true;
  menuTargetId = null;
}

function deletePhoto(id) {
  localStorage.removeItem(`photo:${id}`);
  const extraIds = getExtraIds();
  if (extraIds.includes(id)) {
    saveExtraIds(extraIds.filter((extraId) => extraId !== id));
    document.getElementById(id)?.remove();
  } else {
    const card = document.getElementById(id);
    if (card) {
      card.classList.remove("has-image");
      applyImage(id, placeholderDataUrl(id));
    }
  }
}

document.addEventListener("contextmenu", (e) => {
  const card = e.target.closest(".photo-card.has-image");
  if (!card) return;
  e.preventDefault();
  menuTargetId = card.id;
  contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 150)}px`;
  contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 90)}px`;
  contextMenu.hidden = false;
});

contextMenu.addEventListener("click", (e) => {
  const action = e.target.closest("button")?.dataset.action;
  if (!action || !menuTargetId) return;
  const id = menuTargetId;
  closeContextMenu();

  if (action === "replace") {
    currentTarget = id;
    currentShape = "gallery";
    addingNewSlot = false;
    fileInput.value = "";
    fileInput.click();
  } else if (action === "delete") {
    deletePhoto(id);
  }
});

document.addEventListener("click", (e) => {
  if (!contextMenu.hidden && !contextMenu.contains(e.target)) closeContextMenu();
});
document.addEventListener("scroll", closeContextMenu, true);
window.addEventListener("resize", closeContextMenu);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeContextMenu();
});

document.getElementById("reset-all").addEventListener("click", () => {
  if (!confirm("모든 사진을 샘플 이미지로 되돌릴까요? 추가로 올린 사진도 함께 삭제돼요.")) return;

  Object.keys(PALETTES).forEach((id) => {
    localStorage.removeItem(`photo:${id}`);
    document.getElementById(id)?.classList.remove("has-image");
    applyImage(id, placeholderDataUrl(id));
  });

  getExtraIds().forEach((id) => {
    localStorage.removeItem(`photo:${id}`);
    document.getElementById(id)?.remove();
  });
  localStorage.removeItem(EXTRA_KEY);
});

initPhotos();
