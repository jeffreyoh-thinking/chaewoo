const fileInput = document.getElementById("file-input");
const addPhotoBtn = document.getElementById("add-photo-btn");
const EXTRA_KEY = "gallery:extra-ids";
const GH_TOKEN_KEY = "gh:token";

// 이 사이트가 사용하는 저장소는 고정값이라 누구나 사진을 "볼" 때는
// 토큰이 필요 없습니다. 토큰은 "편집(업로드/교체/삭제)"할 때만 필요해요.
const GH_OWNER = "jeffreyoh-thinking";
const GH_REPO = "chaewoo";
const GH_BRANCH = "main";

let currentTarget = null;
let currentShape = null;
let addingNewSlot = false;
let ghImageIndex = new Map();

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

/* ---------- 공통 유틸 ---------- */

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

function dataUrlToBase64(dataUrl) {
  return dataUrl.split(",")[1];
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

/* ---------- 로컬(오프라인) 모드 ---------- */

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

function loadImageLocal(id) {
  const saved = localStorage.getItem(`photo:${id}`);
  applyImage(id, saved || placeholderDataUrl(id));
  document.getElementById(id)?.classList.toggle("has-image", !!saved);
}

/* ---------- 갤러리 슬롯 생성/정리 ---------- */

function createGallerySlot(id) {
  if (document.getElementById(id)) return document.getElementById(id);
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

function clearDynamicSlots() {
  document.querySelectorAll(".gallery .grid .photo-card:not(.add-photo-card)").forEach((card) => {
    if (!Object.prototype.hasOwnProperty.call(PALETTES, card.id)) {
      card.remove();
    }
  });
}

/* ---------- GitHub 동기화 ---------- */

function getGhToken() {
  return localStorage.getItem(GH_TOKEN_KEY) || "";
}

function saveGhToken(token) {
  localStorage.setItem(GH_TOKEN_KEY, token);
}

function clearGhToken() {
  localStorage.removeItem(GH_TOKEN_KEY);
}

function ghConfig() {
  return { owner: GH_OWNER, repo: GH_REPO, branch: GH_BRANCH, token: getGhToken() };
}

function ghHeaders(cfg) {
  const headers = { Accept: "application/vnd.github+json" };
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
  return headers;
}

async function ghGetFile(cfg, path) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: ghHeaders(cfg) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub 조회 실패 (${res.status})`);
  return res.json();
}

async function ghListImages(cfg) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/images?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: ghHeaders(cfg) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub 목록 조회 실패 (${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data.filter((item) => item.type === "file") : [];
}

async function ghPutFile(cfg, path, base64Content, message) {
  const existing = await ghGetFile(cfg, path);
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}`;
  const body = { message, content: base64Content, branch: cfg.branch };
  if (existing) body.sha = existing.sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(cfg), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub 업로드 실패 (${res.status})`);
  }
  return res.json();
}

async function ghDeleteFile(cfg, path, sha, message) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { ...ghHeaders(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch: cfg.branch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub 삭제 실패 (${res.status})`);
  }
}

function safeIdFromFileName(name) {
  return "extra-" + name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

/* ---------- 사진 초기 로딩 ---------- */

async function initPhotos() {
  clearDynamicSlots();
  ghImageIndex.clear();
  const cfg = ghConfig();
  updateSyncBadge(!!cfg.token);

  try {
    const files = await ghListImages(cfg);
    const byName = new Map(files.map((f) => [f.name, f]));

    Object.keys(PALETTES).forEach((id) => {
      const file = byName.get(`${id}.jpg`);
      const card = document.getElementById(id);
      if (file) {
        applyImage(id, `${file.download_url}?sha=${file.sha}`);
        card?.classList.add("has-image");
        ghImageIndex.set(id, { path: file.path, sha: file.sha });
        byName.delete(`${id}.jpg`);
      } else {
        applyImage(id, placeholderDataUrl(id));
        card?.classList.remove("has-image");
      }
    });

    byName.forEach((file) => {
      const domId = safeIdFromFileName(file.name);
      createGallerySlot(domId);
      applyImage(domId, `${file.download_url}?sha=${file.sha}`);
      document.getElementById(domId)?.classList.add("has-image");
      ghImageIndex.set(domId, { path: file.path, sha: file.sha });
    });
  } catch (err) {
    // 네트워크 오류 등으로 GitHub를 읽지 못하면 이 기기의 로컬 저장 내용으로 대체 표시
    console.error(err);
    Object.keys(PALETTES).forEach(loadImageLocal);
    getExtraIds().forEach((id) => {
      createGallerySlot(id);
      loadImageLocal(id);
    });
  }
}

/* ---------- 동기화 뱃지 / 설정 모달 상태 표시 ---------- */

const syncBadge = document.getElementById("sync-badge");

function updateSyncBadge(isEditor) {
  if (!syncBadge) return;
  if (isEditor) {
    syncBadge.hidden = false;
    syncBadge.textContent = "✏️ 편집 가능 (연결됨)";
    syncBadge.className = "sync-badge ok";
  } else {
    syncBadge.hidden = true;
  }
}

function flashSyncBadge(msg, kind) {
  if (!syncBadge) return;
  syncBadge.hidden = false;
  syncBadge.textContent = msg;
  syncBadge.className = "sync-badge" + (kind ? ` ${kind}` : "");
  setTimeout(() => updateSyncBadge(!!getGhToken()), 2500);
}

function setGhStatus(msg, kind) {
  const el = document.getElementById("gh-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "modal-status" + (kind ? ` ${kind}` : "");
}

/* ---------- 설정 모달 ---------- */

const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const ghTokenInput = document.getElementById("gh-token");
const ghSaveBtn = document.getElementById("gh-save");
const ghDisconnectBtn = document.getElementById("gh-disconnect");

function openSettings() {
  ghTokenInput.value = getGhToken();
  setGhStatus("", "");
  settingsOverlay.hidden = false;
}

function closeSettings() {
  settingsOverlay.hidden = true;
}

settingsBtn.addEventListener("click", openSettings);

settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

ghSaveBtn.addEventListener("click", async () => {
  const token = ghTokenInput.value.trim();
  if (!token) {
    setGhStatus("토큰을 입력해주세요.", "err");
    return;
  }

  setGhStatus("연결 확인 중...", "");
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/images`, {
      headers: ghHeaders({ token }),
    });
    if (res.status === 401) throw new Error("토큰이 올바르지 않아요");
    if (!res.ok && res.status !== 404) throw new Error(`연결 실패 (${res.status})`);

    saveGhToken(token);
    setGhStatus("연결됐어요! 사진을 불러오는 중...", "ok");
    await initPhotos();
    setGhStatus("연결 완료 ✅ 이제 사진을 편집할 수 있어요.", "ok");
  } catch (err) {
    setGhStatus(err.message, "err");
  }
});

ghDisconnectBtn.addEventListener("click", async () => {
  clearGhToken();
  closeSettings();
  await initPhotos();
});

/* ---------- 사진 업로드(편집 버튼 / 추가 버튼) ---------- */

function requireEditor() {
  if (getGhToken()) return true;
  alert("사진을 바꾸려면 먼저 ⚙ 설정에서 GitHub 토큰을 연결해주세요.");
  openSettings();
  return false;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".edit-btn[data-target]");
  if (!btn) return;
  if (!requireEditor()) return;
  currentTarget = btn.dataset.target;
  currentShape = btn.dataset.shape;
  addingNewSlot = false;
  fileInput.value = "";
  fileInput.click();
});

addPhotoBtn.addEventListener("click", () => {
  if (!requireEditor()) return;
  addingNewSlot = true;
  currentShape = "gallery";
  fileInput.value = "";
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file || (!currentTarget && !addingNewSlot)) return;
  if (!getGhToken()) return;

  const maxSize = currentShape === "cover" ? 1200 : currentShape === "avatar" ? 400 : 800;
  const cfg = ghConfig();

  try {
    const dataUrl = await resizeImage(file, maxSize);

    let id = currentTarget;
    let path;

    if (addingNewSlot) {
      const ts = Date.now();
      id = `extra-${ts}`;
      path = `images/photo-extra-${ts}.jpg`;
      createGallerySlot(id);
      addingNewSlot = false;
    } else {
      path = ghImageIndex.get(id)?.path || `images/${id}.jpg`;
    }
    currentTarget = id;

    applyImage(id, dataUrl);
    document.getElementById(id)?.classList.add("has-image");
    flashSyncBadge("☁️ 저장하는 중...", "");

    const result = await ghPutFile(cfg, path, dataUrlToBase64(dataUrl), `사진 업데이트: ${path}`);
    ghImageIndex.set(id, { path, sha: result.content.sha });
    flashSyncBadge("☁️ 저장됨 ✅", "ok");
  } catch (err) {
    alert("사진을 저장하지 못했어요: " + err.message);
  }
});

/* ---------- 우클릭 컨텍스트 메뉴 (교체 / 삭제) ---------- */

const contextMenu = document.getElementById("context-menu");
let menuTargetId = null;

function closeContextMenu() {
  contextMenu.hidden = true;
  menuTargetId = null;
}

async function deletePhoto(id) {
  const cfg = ghConfig();
  const entry = ghImageIndex.get(id);
  if (!entry) return;
  try {
    flashSyncBadge("☁️ 삭제하는 중...", "");
    await ghDeleteFile(cfg, entry.path, entry.sha, `사진 삭제: ${entry.path}`);
    ghImageIndex.delete(id);
    if (Object.prototype.hasOwnProperty.call(PALETTES, id)) {
      document.getElementById(id)?.classList.remove("has-image");
      applyImage(id, placeholderDataUrl(id));
    } else {
      document.getElementById(id)?.remove();
    }
    flashSyncBadge("☁️ 삭제됨 ✅", "ok");
  } catch (err) {
    alert("삭제하지 못했어요: " + err.message);
    updateSyncBadge(!!cfg.token);
  }
}

document.addEventListener("contextmenu", (e) => {
  if (!getGhToken()) return; // 편집 권한이 없으면 브라우저 기본 메뉴(이미지 저장 등)를 그대로 둠
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
  if (e.key === "Escape") {
    closeContextMenu();
    closeSettings();
  }
});

/* ---------- 게시판 (채우에게 한마디 하기) - Firestore 연동 ---------- */

const guestbookForm = document.getElementById("guestbook-form");
const guestbookNameInput = document.getElementById("guestbook-name");
const guestbookMessageInput = document.getElementById("guestbook-message");
const guestbookList = document.getElementById("guestbook-list");
const guestbookEmpty = document.getElementById("guestbook-empty");

let isGuestbookAdmin = false;
let lastGuestbookDocs = [];

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatGuestbookDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function renderGuestbookMessages(docs) {
  if (!guestbookList) return;
  lastGuestbookDocs = docs;
  guestbookEmpty.hidden = docs.length > 0;
  guestbookEmpty.textContent = "아직 남겨진 메시지가 없어요. 첫 메시지를 남겨보세요!";
  guestbookList.innerHTML = docs
    .map((doc) => {
      const m = doc.data();
      return `
      <li class="guestbook-item" data-id="${doc.id}">
        ${isGuestbookAdmin ? `<button type="button" class="guestbook-item-delete" data-id="${doc.id}" title="삭제">🗑</button>` : ""}
        <div class="guestbook-item-header">
          <span class="guestbook-item-name">${escapeHtml(m.name)}</span>
          <span class="guestbook-item-date">${formatGuestbookDate(m.ts)}</span>
        </div>
        <div class="guestbook-item-text">${escapeHtml(m.text)}</div>
      </li>`;
    })
    .join("");
}

async function deleteGuestbookMessage(id) {
  try {
    await guestbookDb.collection("guestbook").doc(id).delete();
  } catch (err) {
    alert("메시지를 삭제하지 못했어요: " + err.message);
  }
}

function initGuestbook() {
  if (typeof guestbookDb === "undefined" || !guestbookForm) return;

  guestbookDb
    .collection("guestbook")
    .orderBy("ts", "desc")
    .limit(100)
    .onSnapshot(
      (snapshot) => renderGuestbookMessages(snapshot.docs),
      (err) => {
        console.error(err);
        guestbookEmpty.hidden = false;
        guestbookEmpty.textContent = "메시지를 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
      }
    );

  guestbookForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = guestbookNameInput.value.trim();
    const text = guestbookMessageInput.value.trim();
    if (!name || !text) return;

    const submitBtn = guestbookForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await guestbookDb.collection("guestbook").add({
        name,
        text,
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      });
      guestbookForm.reset();
    } catch (err) {
      alert("메시지를 남기지 못했어요: " + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  guestbookList.addEventListener("click", (e) => {
    const btn = e.target.closest(".guestbook-item-delete");
    if (!btn) return;
    if (!confirm("이 메시지를 삭제할까요?")) return;
    deleteGuestbookMessage(btn.dataset.id);
  });
}

initGuestbook();

/* ---------- 방명록 관리자 로그인 (Firebase Auth) ---------- */

const adminEmailInput = document.getElementById("admin-email");
const adminPasswordInput = document.getElementById("admin-password");
const adminLoginBtn = document.getElementById("admin-login");
const adminLogoutBtn = document.getElementById("admin-logout");

function setAdminStatus(msg, kind) {
  const el = document.getElementById("admin-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "modal-status" + (kind ? ` ${kind}` : "");
}

adminLoginBtn?.addEventListener("click", async () => {
  const email = adminEmailInput.value.trim();
  const password = adminPasswordInput.value;
  if (!email || !password) {
    setAdminStatus("이메일과 비밀번호를 입력해주세요.", "err");
    return;
  }
  setAdminStatus("로그인 중...", "");
  try {
    await guestbookAuth.signInWithEmailAndPassword(email, password);
    adminPasswordInput.value = "";
    setAdminStatus("로그인 완료 ✅ 이제 메시지를 삭제할 수 있어요.", "ok");
  } catch (err) {
    setAdminStatus("로그인 실패: " + err.message, "err");
  }
});

adminLogoutBtn?.addEventListener("click", async () => {
  await guestbookAuth.signOut();
  setAdminStatus("로그아웃했어요.", "");
});

guestbookAuth?.onAuthStateChanged((user) => {
  isGuestbookAdmin = !!user;
  if (adminEmailInput && user) adminEmailInput.value = user.email;
  renderGuestbookMessages(lastGuestbookDocs);
});

initPhotos();
