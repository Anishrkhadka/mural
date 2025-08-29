async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const form = document.getElementById("settingsForm");
const saveMsg = document.getElementById("saveMsg");

function fillForm(s) {
  form.duration_seconds.value = s.duration_seconds ?? 10;
  form.shuffle.checked = !!s.shuffle;
  form.fit_mode.value = s.fit_mode ?? "cover";
  form.order_by.value = s.order_by ?? "name";
  form.hide_cursor_after_ms.value = s.hide_cursor_after_ms ?? 3000;
  form.preload_next.checked = s.preload_next ?? true;
}

async function load() {
  const s = await fetchJSON("/api/settings");
  fillForm(s);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveMsg.textContent = "Saving…";
  const payload = {
    duration_seconds: parseInt(form.duration_seconds.value, 10),
    shuffle: form.shuffle.checked,
    fit_mode: form.fit_mode.value,
    order_by: form.order_by.value,
    hide_cursor_after_ms: parseInt(form.hide_cursor_after_ms.value, 10),
    preload_next: form.preload_next.checked
  };
  try {
    const saved = await fetchJSON("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    saveMsg.textContent = "Saved ✓ (changes apply when slideshow reloads)";
  } catch (err) {
    saveMsg.textContent = "Error: " + String(err);
  }
});

load().catch(console.error);
