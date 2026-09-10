/* ============================================================
   EDIT ME — settings
   Project URL and anon key: Supabase dashboard -> Settings -> API.
   The anon key is meant to be public. Never put the service_role
   key in here.
   ============================================================ */
const CONFIG = {
  supabaseUrl: "https://laxycplfdvdjmuceroqf.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxheHljcGxmZHZkam11Y2Vyb3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjcwMzAsImV4cCI6MjEwNDY0MzAzMH0.kHfGcatxO5v2JoLrPt1fai4n69M2WArpsF77tnFa2Qk",

  event: {
    title:    "San's 21st Birthday",
    location: "120 North Ave North, Apt 415, Atlanta, GA 30332",
    details:  "Shrinky dinks, pipe cleaner flowers, mahjong, karaoke, cute drinks.",
    start:    "2026-09-14T19:00:00",
    end:      "2026-09-14T23:30:00"
  }
};

const HEADERS = {
  "apikey": CONFIG.supabaseKey,
  "Authorization": "Bearer " + CONFIG.supabaseKey,
  "Content-Type": "application/json"
};

const form       = document.getElementById("rsvpForm");
const bringBlock = document.getElementById("bringBlock");
const chipsBox   = document.getElementById("chips");

let items = [];

/* ---------- load the list and what's left ---------- */

async function loadItems() {
  const res = await fetch(
    CONFIG.supabaseUrl + "/rest/v1/bring_status?select=*&order=sort",
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error("could not load items");
  items = await res.json();
  renderChips();
}

function renderChips() {
  chipsBox.innerHTML = "";

  items.forEach(item => {
    const unlimited = item.quota === null;
    const left = unlimited ? Infinity : item.quota - item.claimed;
    const full = left <= 0;

    const label = document.createElement("label");
    if (full) label.className = "full";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "bring";
    input.value = item.id;
    input.disabled = full;

    const text = document.createElement("span");
    text.textContent = item.label;

    label.append(input, text);

    if (!unlimited) {
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = full
        ? "covered"
        : " (" + item.claimed + " of " + item.quota + ")";
      label.append(count);
    }

    chipsBox.append(label);
  });
}

/* If Supabase is unreachable, still let people RSVP — just without
   counts. A broken checklist shouldn't block the actual headcount. */
function renderChipsOffline() {
  chipsBox.innerHTML =
    '<p class="hint">checklist unavailable right now — ' +
    'RSVP anyway and tell us in the notes what you can bring.</p>';
}

loadItems().catch(renderChipsOffline);

/* ---------- show the checklist only if they're coming ---------- */

form.addEventListener("change", (e) => {
  if (e.target.name === "attending") {
    const coming = e.target.value === "yes";
    bringBlock.hidden = !coming;
    document.getElementById("attErr").hidden = true;
    // refresh counts on open — someone may have claimed since page load
    if (coming && items.length) loadItems().catch(() => {});
  }
  if (e.target.id === "name") document.getElementById("nameErr").hidden = true;
});

/* ---------- submit ---------- */

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name      = document.getElementById("name").value.trim();
  const attending = form.querySelector("input[name=attending]:checked");
  const note      = document.getElementById("note").value.trim();
  const picked    = [...form.querySelectorAll("input[name=bring]:checked")]
                      .map(c => c.value);

  let bad = false;
  document.getElementById("sendErr").hidden = true;
  document.getElementById("nameErr").hidden = !!name;
  if (!name) bad = true;
  document.getElementById("attErr").hidden = !!attending;
  if (!attending) bad = true;
  if (bad) {
    form.querySelector(".err:not([hidden])")
        .scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }

  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    const res = await fetch(CONFIG.supabaseUrl + "/rest/v1/rpc/submit_rsvp", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        p_name: name,
        p_attending: attending.value === "yes",
        p_note: note,
        p_items: picked
      })
    });
    if (!res.ok) throw new Error(await res.text());

    const result = await res.json();
    showDone(name, attending.value === "yes", result);
  } catch (err) {
    console.error(err);
    document.getElementById("sendErr").hidden = false;
    btn.disabled = false;
    btn.textContent = "Send RSVP";
  }
});

function labelFor(id) {
  const it = items.find(i => i.id === id);
  return it ? it.label : id;
}

function showDone(name, coming, result) {
  document.getElementById("doneTitle").textContent = coming ? "yay" : "next time";
  document.getElementById("doneMsg").textContent = coming
    ? "you're on the list, " + name + ". september 14th at 7:00pm."
    : "thanks for telling us, " + name + ". you'll be missed.";

  const list = document.getElementById("doneList");
  list.innerHTML = "";

  const claimed = (result.claimed || []).map(labelFor);
  const full    = (result.full    || []).map(labelFor);

  if (claimed.length) {
    const li = document.createElement("li");
    li.textContent = "you're bringing: " + claimed.join(", ");
    list.append(li);
  }
  if (full.length) {
    const li = document.createElement("li");
    li.textContent = "someone beat you to " + full.join(" and ") +
                     " — no need to bring it.";
    list.append(li);
  }

  document.getElementById("formView").hidden = true;
  document.getElementById("doneView").hidden = false;
  document.getElementById("rsvp").scrollIntoView({ block: "center", behavior: "smooth" });
}

/* ---------- add to calendar ---------- */

document.getElementById("ics").addEventListener("click", () => {
  const fmt = (s) => {
    const d = new Date(s);
    const p = (n) => String(n).padStart(2, "0");
    return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T"
         + p(d.getUTCHours()) + p(d.getUTCMinutes()) + "00Z";
  };
  const e = CONFIG.event;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//invite//EN", "BEGIN:VEVENT",
    "UID:" + Date.now() + "@invite",
    "DTSTAMP:" + fmt(new Date().toISOString()),
    "DTSTART:" + fmt(e.start),
    "DTEND:"   + fmt(e.end),
    "SUMMARY:"     + e.title,
    "LOCATION:"    + e.location,
    "DESCRIPTION:" + e.details,
    "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "birthday.ics";
  a.click();
  URL.revokeObjectURL(url);
});