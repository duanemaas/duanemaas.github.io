# Cyber Security Survey (local)

A small local app that connects the Cyber Security Project survey to its FileMaker Server
database through the FileMaker Data API. It runs on your own computer: the survey page and the
FileMaker login stay on `localhost` and are never published to the GitHub Pages site.

The form is built from the FileMaker layout itself: every editable field on the layout becomes a
question, and fields with a value list become drop-downs. Calculation, summary, global and
auto-enter fields are skipped and can't be written from the form.

## 1. Prepare FileMaker Server

1. In **Admin Console → Connectors → FileMaker Data API**, make sure the Data API is enabled.
2. In the survey file, create an account for the web survey (for example `web_survey`). Give its
   privilege set the **Access via FileMaker Data API (fmrest)** extended privilege. Grant access
   only to the survey table and layout.
3. Create a layout for the survey (for example `Survey_Web`) holding just the fields respondents
   should fill in. Field names are used as the question labels, with `_` shown as spaces.

## 2. Configure

Requires Node.js 20.6 or newer. There are no packages to install.

```sh
cd survey
cp .env.example .env
```

Edit `.env` and set `FM_HOST`, `FM_DATABASE`, `FM_LAYOUT`, `FM_USER` and `FM_PASSWORD`.
If FileMaker Server still uses its default self-signed certificate, set
`FM_ALLOW_SELF_SIGNED=true`. Leave it `false` once a real certificate is installed.

## 3. Test the connection

```sh
npm run check
```

This logs in, lists the fields the survey will show, and counts the existing responses.

## 4. Run the survey

```sh
npm start
```

Open <http://localhost:3000>. You can submit responses there and see them in the table below the form.

## Common FileMaker errors

| Code | Meaning |
| ---- | ------- |
| 212  | Wrong account name or password, or the account lacks the `fmrest` privilege |
| 802  | The database file isn't open on FileMaker Server (check `FM_DATABASE`) |
| 105  | Layout not found (check `FM_LAYOUT`) |
| 102  | A submitted field isn't on the layout |
| `self-signed certificate` | Set `FM_ALLOW_SELF_SIGNED=true`, or install a trusted certificate |
