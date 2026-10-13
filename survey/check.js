// Connection test: logs in to FileMaker Server and lists the survey layout's fields.

import { getSurveyFields, listResponses, logout, settings } from "./filemaker.js";

console.log(`Connecting to ${settings.host} / ${settings.database} / layout ${settings.layout} ...`);
try {
  const fields = await getSurveyFields();
  const responses = await listResponses(1000);
  console.log(`Connected. ${fields.length} survey fields, ${responses.length} existing responses.`);
  for (const field of fields) {
    console.log(`  - ${field.name} (${field.input}${field.required ? ", required" : ""}${field.choices ? `, choices: ${field.choices.join(" / ")}` : ""})`);
  }
} catch (err) {
  console.error(`Connection failed: ${err.message}${err.code ? ` (FileMaker error ${err.code})` : ""}`);
  process.exitCode = 1;
} finally {
  await logout();
}
