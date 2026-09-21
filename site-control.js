// AURA ARMAN TOUR - siteControl.js
// Include on the USER-FACING pages (not admin.html):
// <script type="module" src="./site-control.js"></script>
import { rtdb } from "./firebase.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const CONTROL = ref(rtdb, "siteControl");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ensureOverlay() {
  let el = document.getElementById("auraSiteLock");
  if (el) return el;

  el = document.createElement("div");
  el.id = "auraSiteLock";
  el.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:none;" +
    "align-items:center;justify-content:center;padding:20px;" +
    "background:#020617;color:#fff;font-family:Arial,sans-serif;text-align:center;";
  document.body.appendChild(el);
  return el;
}

function lock(type, data) {
  const overlay = ensureOverlay();
  const isUpdate = type === "update";
  const message = isUpdate
    ? (data.updateMessage || "নতুন আপডেট এসেছে। অ্যাপ আপডেট করুন।")
    : (data.maintenanceMessage || "সাইট বর্তমানে রক্ষণাবেক্ষণে আছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।");

  overlay.innerHTML = `
    <div style="width:min(430px,100%);background:#0b1220;border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:28px;box-shadow:0 25px 80px rgba(0,0,0,.6)">
      <div style="font-size:48px;margin-bottom:14px">${isUpdate ? "🚀" : "🛠️"}</div>
      <h1 style="font-size:22px;margin:0 0 10px">${isUpdate ? "App Update Required" : "Maintenance Mode"}</h1>
      <p style="font-size:14px;line-height:1.7;color:#94a3b8;margin:0 0 20px">${escapeHtml(message)}</p>
      ${
        isUpdate && data.updateLink
          ? `<button id="auraUpdateNow" style="width:100%;border:0;border-radius:14px;padding:14px;background:#2563eb;color:white;font-weight:800;font-size:15px">Update Now</button>`
          : ""
      }
    </div>
  `;
  overlay.style.display = "flex";

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  const updateButton = document.getElementById("auraUpdateNow");
  if (updateButton) {
    updateButton.onclick = () => {
      window.location.href = data.updateLink;
    };
  }
}

function unlock() {
  const overlay = document.getElementById("auraSiteLock");
  if (overlay) overlay.style.display = "none";
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}

onValue(CONTROL, (snapshot) => {
  const data = snapshot.val() || {};

  if (data.maintenance === true) {
    lock("maintenance", data);
    return;
  }

  if (data.appUpdate === true) {
    lock("update", data);
    return;
  }

  unlock();
}, (error) => {
  console.error("siteControl listener failed:", error);
});
