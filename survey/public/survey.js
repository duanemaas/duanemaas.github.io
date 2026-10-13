const statusEl = document.getElementById("status");
const form = document.getElementById("survey-form");
const questionsEl = document.getElementById("questions");
const table = document.getElementById("responses-table");

let fields = [];

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.code ? `${data.error} (FileMaker error ${data.code})` : data.error);
  return data;
}

function buildInput(field) {
  let input;
  if (field.choices) {
    input = document.createElement("select");
    input.append(new Option("Select…", ""));
    for (const choice of field.choices) input.append(new Option(choice, choice));
  } else if (field.input === "textarea") {
    input = document.createElement("textarea");
  } else {
    input = document.createElement("input");
    input.type = field.input;
  }
  input.name = field.name;
  input.id = `q-${field.name}`;
  input.required = field.required;
  return input;
}

function renderQuestions() {
  questionsEl.replaceChildren(...fields.map((field) => {
    const wrap = document.createElement("div");
    wrap.className = "question";
    const label = document.createElement("label");
    label.htmlFor = `q-${field.name}`;
    label.textContent = field.label + (field.required ? " *" : "");
    wrap.append(label, buildInput(field));
    return wrap;
  }));
}

// FileMaker's Data API expects MM/DD/YYYY dates and MM/DD/YYYY HH:MM:SS timestamps.
function toFileMaker(field, value) {
  if (!value) return value;
  if (field.input === "date") {
    const [y, m, d] = value.split("-");
    return `${m}/${d}/${y}`;
  }
  if (field.input === "datetime-local") {
    const [date, time] = value.split("T");
    const [y, m, d] = date.split("-");
    return `${m}/${d}/${y} ${time.length === 5 ? `${time}:00` : time}`;
  }
  return value;
}

async function loadResponses() {
  try {
    const rows = await api("/api/responses");
    const columns = fields.map((field) => field.name);
    table.replaceChildren();
    const head = table.createTHead();
    const headRow = head.insertRow();
    for (const name of columns) headRow.append(Object.assign(document.createElement("th"), { textContent: name.replace(/_/g, " ") }));
    const body = table.createTBody();
    if (!rows.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = columns.length || 1;
      cell.textContent = "No responses yet.";
      return;
    }
    for (const row of rows) {
      const tr = body.insertRow();
      for (const name of columns) tr.insertCell().textContent = row[name] ?? "";
    }
  } catch (err) {
    table.replaceChildren();
    setStatus(`Could not load responses: ${err.message}`, "error");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const answers = Object.fromEntries(fields.map((field) => [field.name, toFileMaker(field, data.get(field.name))]));
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await api("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(answers),
    });
    form.reset();
    setStatus("Thank you — your response was saved to the survey database.", "ok");
    loadResponses();
  } catch (err) {
    setStatus(`Could not save response: ${err.message}`, "error");
  } finally {
    button.disabled = false;
  }
});

document.getElementById("refresh").addEventListener("click", loadResponses);

(async () => {
  try {
    fields = await api("/api/fields");
    renderQuestions();
    form.hidden = false;
    setStatus(fields.length ? "Connected to the survey database." : "Connected, but the survey layout has no editable fields.", "ok");
    loadResponses();
  } catch (err) {
    setStatus(`Could not connect to the survey database: ${err.message}`, "error");
  }
})();
