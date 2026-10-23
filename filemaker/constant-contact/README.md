# Constant Contact scripts

FileMaker scripts that sync the **Social Media Manager** file with Constant
Contact through the v3 API, using `Insert from URL` (cURL). No plug-in is needed.

Each file is an `fmxmlsnippet`. Open it in a text editor, select all, copy, and
paste into the FileMaker Script Workspace. Copy from the file itself: other
sources can drop variable names when you paste.

## Scripts, in paste order

Each script finds the scripts it calls by name when you paste it, so paste them
in this order and keep these exact names.

| File | Script name | What it does |
|---|---|---|
| `check-constant-contact-connection.xml` | Check Constant Contact Connection | Tests the API and refreshes the access token |
| `import-constant-contact-contacts.xml` | Import Constant Contact Contacts | Links and creates contacts, records unsubscribes, checks the list boxes for newly linked contacts |
| `import-constant-contact-lists.xml` | Import Constant Contact Lists | Imports lists and members. A member added in Constant Contact checks the box; a member removed clears it |
| `push-contacts-to-constant-contact.xml` | Push Contacts to Constant Contact | Sends box changes made in FileMaker to Constant Contact |
| `sync-constant-contact.xml` | Sync Constant Contact | Runs the import contacts, import lists and push steps in that order, then shows one summary |
| `check-boxes-for-constant-contact-lists.xml` | Check Boxes for Constant Contact Lists | One-time catch-up, see below |

Run the scripts from a **CONSTANTC** layout. Use **Sync Constant Contact** for
day-to-day work. The order matters: the imports bring Constant Contact's changes
in first, and then the push sends FileMaker's changes out.

## Fields this expects on CONTACTS

| Field | Type | Meaning |
|---|---|---|
| `is_aACE ERP` | Number, checkbox storing 1 | On the **aACE ERP** list |
| `is_SalesTrackR` | Number, checkbox storing 1 | On the **SalesTrackR** list |
| `CC_Unsubscribed` | Number, checkbox storing 1 | Unsubscribed in Constant Contact. Set by the import, never pushed back |

If your field names differ, rename them in FileMaker or search and replace them
in the XML before pasting. The list names **aACE ERP** and **SalesTrackR** must
match the list names in Constant Contact exactly. They appear in the push,
both import scripts and the catch-up script.

## How the two sides stay in step

The `CCSUBSCRIBER` table is the record of "who was on which list at the last
sync". Each side's changes are measured against it:

- **Box checked in FileMaker, no CCSUBSCRIBER row:** the push adds the contact
  to the list. If the contact isn't in Constant Contact yet, the push creates it
  using their CONTACTINFO email, preferring the one flagged
  `flag_ConstantContactEmail`.
- **Box unchecked in FileMaker, CCSUBSCRIBER row exists:** the push removes the
  contact from the list.
- **Added or removed in Constant Contact:** the list import creates or deletes
  the CCSUBSCRIBER row and checks or clears the box.
- **Unsubscribed in Constant Contact:** the contacts import sets
  `CC_Unsubscribed` and logs it in `CC_ChangeLog`. The boxes stay as they are,
  and the push never adds that person to a list again. If they opt back in
  through Constant Contact, the flag is cleared.
- Contacts that are only in Constant Contact and not linked in FileMaker are
  never removed by the push.

Every change is written to `CC_ChangeLog` on the contact.

## Safety checks

- If the push would remove more than 25 people from a list, it asks first. On
  FileMaker Server, where no one can answer, it skips that removal and reports it.
- If a field name is wrong, the SQL fails and the script stops for that list
  without changing anything.
- An email that already exists in Constant Contact, for example someone who
  unsubscribed, is never forced back in. It is listed under "Not done" so that
  Import Constant Contact Contacts can link it.

## First run

1. Paste the scripts in the order above.
2. Run **Import Constant Contact Lists** once, so CCLIST knows the two new lists.
3. If people were already on the aACE ERP or SalesTrackR lists before the boxes
   existed, run **Check Boxes for Constant Contact Lists** once. Otherwise the
   push sees their empty boxes and offers to remove them.
4. Run **Sync Constant Contact**.

List changes go through Constant Contact's background "activities", which
usually finish within a few seconds. Give them a minute before checking the
lists in Constant Contact.
