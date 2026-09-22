# FileMaker survey email scripts

Script XML for the cybersecurity survey's results email. Each file is an
`fmxmlsnippet` — open it in a text editor, select all, copy, and paste into the
FileMaker Script Workspace. Copy from the file rather than from a browser or
chat window; other sources can drop the variable names when pasting.

The email is sent with `Insert from URL` over SMTP (cURL). No plugin is needed.
It carries both an HTML version and a plain-text fallback, with the logo
embedded so mail apps display it without loading remote images.

## Files, in paste order

| File | Script | Runs on |
|---|---|---|
| `01-send-survey-email.server.xml` | Send Survey Email | FileMaker Server, via Perform Script on Server |
| `02-complete-survey.client.xml` | Complete Survey | The user's session (WebDirect) |
| `03-answer-question.client.xml` | The answer/next-question script | The user's session (WebDirect) |

Paste them in this order. Each script finds the one it calls by name at paste
time, so the called script has to exist first.

`tests/` holds two standalone scripts that send a single test email — one using
cURL, one using the 360Works Email plugin. Both have placeholder values for the
mail server, username and license key.

## How it fits together

1. The answer script saves each answer and, after the last question, runs
   Complete Survey.
2. Complete Survey scores the survey, writes the results to the `Survey`
   record, builds the recommendation lists, and passes them to the server as
   one JSON parameter (`to`, `textBody`, `itemsHTML`, `score`, `grade`).
3. Send Survey Email reads the mail settings and logo from `_globals`, builds
   the message, sends it, and returns `{"ok":1}` or an error the client shows.

The server session cannot see the user session's `$$` variables, which is why
everything it needs travels in the parameter or comes from `_globals`.

## Requirements

- **`_globals` table** with `SMTP_Server` (host only, e.g. `mail.example.com`),
  `SMTP_Account`, `SMTP_Pass` and `Logo` (an embedded PNG/JPG/GIF, not a file
  reference). These are global fields, so their values must be saved in the
  file while it is open locally — values typed in while hosted last only for
  that session.
- **Run script with full access privileges** on Send Survey Email, so it can
  read `_globals` when those fields are restricted.
- **Port 587 (STARTTLS)** is assumed: `smtp://<host>:587` with `--ssl-reqd`.
  For implicit TLS use `smtps://<host>:465`.
- The startup script should exit early when `Get ( SystemPlatform ) = 4`, so it
  does not run in the server session.

## Notes

- Answers scoring 4 (the top score) are left out of the improvement list. If
  every answer scores 4, the email says so instead of showing an empty list.
- Blind copies go to the addresses listed in the `$curl` step of the server
  script.
- The email links to <https://www.mcservices.com/cybersecurity-policies-part-1/>.
