// Minimal client for the FileMaker Server Data API.
// https://help.claris.com/en/data-api-guide/

import https from "node:https";

const required = ["FM_HOST", "FM_DATABASE", "FM_LAYOUT", "FM_USER", "FM_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Missing settings in .env: ${missing.join(", ")} (see .env.example)`);
}

const {
  FM_HOST,
  FM_DATABASE,
  FM_LAYOUT,
  FM_USER,
  FM_PASSWORD,
} = process.env;

// Accepts "host", "host:port" or a pasted "https://host/" URL.
const server = new URL(/^https?:\/\//.test(FM_HOST) ? FM_HOST : `https://${FM_HOST}`);

const allowSelfSigned = process.env.FM_ALLOW_SELF_SIGNED === "true";
const fieldFilter = (process.env.FM_FIELDS || "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const basePath = `/fmi/data/vLatest/databases/${encodeURIComponent(FM_DATABASE)}`;
const layoutPath = `${basePath}/layouts/${encodeURIComponent(FM_LAYOUT)}`;

// FileMaker error 952 means the session token is invalid or expired.
const INVALID_TOKEN = "952";

let token = null;

export class FileMakerError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function request(method, path, { body, headers = {} } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: server.hostname,
        port: server.port || 443,
        method,
        path,
        rejectUnauthorized: !allowSelfSigned,
        headers: {
          ...(payload !== undefined && {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          }),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let json;
          try {
            json = JSON.parse(raw);
          } catch {
            return reject(new FileMakerError(`Unexpected response from FileMaker Server (HTTP ${res.statusCode})`, null, res.statusCode));
          }
          const message = json.messages?.[0] ?? {};
          if (message.code !== "0") {
            return reject(new FileMakerError(message.message || "FileMaker request failed", message.code, res.statusCode));
          }
          resolve(json.response);
        });
      },
    );
    req.on("error", (err) => reject(new FileMakerError(`Cannot reach FileMaker Server at ${FM_HOST}: ${err.message}`, null, 502)));
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function login() {
  const credentials = Buffer.from(`${FM_USER}:${FM_PASSWORD}`).toString("base64");
  const response = await request("POST", `${basePath}/sessions`, {
    body: {},
    headers: { Authorization: `Basic ${credentials}` },
  });
  token = response.token;
}

// Runs a Data API call with the cached session, logging in again once if it expired.
async function call(method, path, body) {
  if (!token) await login();
  try {
    return await request(method, path, { body, headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    if (err.code !== INVALID_TOKEN) throw err;
    await login();
    return request(method, path, { body, headers: { Authorization: `Bearer ${token}` } });
  }
}

export async function logout() {
  if (!token) return;
  const current = token;
  token = null;
  await request("DELETE", `${basePath}/sessions/${current}`).catch(() => {});
}

function inputType(field) {
  switch (field.result) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "time":
      return "time";
    case "timeStamp":
      return "datetime-local";
    default:
      return field.maxCharacters && field.maxCharacters <= 255 ? "text" : "textarea";
  }
}

// Fields on the survey layout that a respondent can fill in.
export async function getSurveyFields() {
  const layout = await call("GET", layoutPath);
  return layout.fieldMetaData
    .filter((field) => field.type === "normal" && !field.autoEnter && !field.global)
    .filter((field) => !fieldFilter.length || fieldFilter.includes(field.name))
    .map((field) => ({
      name: field.name,
      label: field.name.replace(/_/g, " "),
      input: inputType(field),
      required: Boolean(field.notEmpty),
      valueList: field.valueList || null,
      choices: layout.valueLists?.find((list) => list.name === field.valueList)?.values.map((v) => v.value) ?? null,
    }));
}

export async function createResponse(answers) {
  const fields = await getSurveyFields();
  const allowed = new Set(fields.map((field) => field.name));
  const fieldData = Object.fromEntries(
    Object.entries(answers).filter(([name, value]) => allowed.has(name) && value !== ""),
  );
  if (!Object.keys(fieldData).length) {
    throw new FileMakerError("No survey answers were submitted", null, 400);
  }
  const result = await call("POST", `${layoutPath}/records`, { fieldData });
  return result.recordId;
}

export async function listResponses(limit = 100) {
  try {
    const result = await call("GET", `${layoutPath}/records?_limit=${limit}`);
    return result.data.map((record) => ({ recordId: record.recordId, ...record.fieldData }));
  } catch (err) {
    // 401 means the layout has no records yet.
    if (err.code === "401") return [];
    throw err;
  }
}

export const settings = { host: FM_HOST, database: FM_DATABASE, layout: FM_LAYOUT };
