# Constant Contact in MCS SalesTrackR

All the Constant Contact scripts now live in the **MCS SalesTrackR** file. It
holds the Constant Contact login and does all the syncing. Social Media Manager
no longer talks to Constant Contact.

Each file is an `fmxmlsnippet`. Open it in a text editor, select all, copy, and
paste into the FileMaker Script Workspace. Copy from the file itself: other
sources can drop variable names when you paste. The scripts carry no internal
ID numbers, so FileMaker matches every layout, field and script **by name**
when you paste. Anything it can't match shows up as `<Field Missing>` or
`<unknown>` in the pasted script, which makes a mismatched name easy to spot.

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
| `check-boxes-for-constant-contact-lists.xml` | Check Boxes for Constant Contact Lists | One-time catch-up, see First run |
| `mark-cc-list-subscribed.xml` | Mark CC List Subscribed | Sets `CC_subscribed` = 1 for every subscribed member of a list (AllContact11525 by default) |

Run the sync scripts from a **CONSTANTC** layout. Mark CC List Subscribed can
start on any layout.

## Moving the login over

1. In Social Media Manager, open Manage Database and copy the **CONSTANTC**,
   **CCLIST** and **CCSUBSCRIBER** tables on the Tables tab. Paste them into MCS
   SalesTrackR.
2. Give each one a layout with the same name: `CONSTANTC`, `CCLIST` and
   `CCSUBSCRIBER`. Create one CONSTANTC record.
3. Copy the four values `CC_ClientID`, `CC_ClientSecret`, `CC_AccessToken` and
   `CC_RefreshToken` from Social Media Manager's CONSTANTC record into the new one.
4. **Stop running the Constant Contact scripts in Social Media Manager** (you can
   delete them). Constant Contact issues a new refresh token every time one is
   used, so the first file to refresh the token breaks the other file's login.

## What MCS SalesTrackR needs

### Tables and layouts

`CONSTANTC`, `CCLIST`, `CCSUBSCRIBER`, `CONTACTS` and `CONTACTINFO`. Each needs a
layout of the same name. The table occurrence names must match too, because
the scripts use them in SQL.

### Fields

| Table | Fields |
|---|---|
| CONSTANTC | `CC_ClientID`, `CC_ClientSecret`, `CC_AccessToken`, `CC_RefreshToken`, `LastSyncTime`, `g_ContactImportList` |
| CCLIST | `_fk_ConstantContactListID`, `List Name`, `ListLog`, `flag_StatusList`, `Flag_Active`, `Flag_DoNotMail`, `Flag_Removed` |
| CCSUBSCRIBER | `_fk_ContactID`, `_fk_ListID`, `_g_ContactList`, `_g_ListID` |
| CONTACTS | `__pk_Contact ID`, `Name First`, `Name Last`, `NameFull_c`, `_fk_ConstantContactID`, `CC_Status`, `CC_LastUpdateTime`, `CC_ChangeLog`, `is_aACE ERP`, `is_SalesTrackR`, `CC_Unsubscribe`, `CC_subscribed`, `Email` |
| CONTACTINFO | `_fk_Entity_ID`, `Type`, `Information`, `flag_ConstantContactEmail` |

`is_aACE ERP`, `is_SalesTrackR`, `CC_Unsubscribe` and `CC_subscribed` are number
fields, with a checked box storing 1. `CONTACTS::Email` is used only by Mark
CC List Subscribed, and its name can be changed at the top of that script.

### Relationships

Recreate these as they are in Social Media Manager:

| Table occurrence | Based on | Joined by |
|---|---|---|
| `ccsubscriber_CONTACT` | CONTACTS | `CCSUBSCRIBER::_fk_ContactID = CONTACTS::_fk_ConstantContactID` |
| `ccsubscriber_CCLIST` | CCLIST | `CCSUBSCRIBER::_fk_ListID = CCLIST::_fk_ConstantContactListID` |
| `contact_ccsubscribers_CCLIST` | CCLIST | From CONTACTS, through CCSUBSCRIBER, to CCLIST |
| `ccsubscriber_CCSUBSCRIBERcontacts` | CCSUBSCRIBER | From the CCSUBSCRIBER globals `_g_ListID` / `_g_ContactList`, to find members no longer on a list |

**If SalesTrackR stores contacts differently,** tell me the real table and field
names and I'll change the scripts to match. For example, the email might be on
CONTACTS itself rather than in a CONTACTINFO table. The easiest way is to run
`adt connect` for MCS SalesTrackR in Claude Code on your Mac, which lets me read
the structure directly.

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
  `CC_Unsubscribe` and logs it in `CC_ChangeLog`. The boxes stay as they are,
  and the push never adds that person to a list again. If they opt back in
  through Constant Contact, the flag is cleared.
- Contacts that are only in Constant Contact and not linked in FileMaker are
  never removed by the push.

Every change is written to `CC_ChangeLog` on the contact. The list names
**aACE ERP** and **SalesTrackR** must match the lists in Constant Contact
exactly.

## Safety checks

- If the push would remove more than 25 people from a list, it asks first. On
  FileMaker Server, where no one can answer, it skips that removal and reports it.
- If a field name is wrong, the SQL fails and the script stops for that list
  without changing anything.
- An email that already exists in Constant Contact, for example someone who
  unsubscribed, is never forced back in. It is listed under "Not done" so that
  Import Constant Contact Contacts can link it.
- Mark CC List Subscribed skips unsubscribed members and only ever sets
  `CC_subscribed` to 1, never clears it. Emails with no match are shown at the
  end and kept in `$$CC_Unmatched`.

## First run

1. Do the "Moving the login over" steps and paste the scripts in order.
2. Run **Import Constant Contact Lists** once, so CCLIST knows the aACE ERP and
   SalesTrackR lists.
3. If people are already on those lists in Constant Contact, run **Check Boxes
   for Constant Contact Lists** once. Otherwise the push sees their empty boxes
   and offers to remove them.
4. Run **Sync Constant Contact**.
5. Run **Mark CC List Subscribed** for AllContact11525.

List changes go through Constant Contact's background "activities", which
usually finish within a few seconds. Give them a minute before checking the
lists in Constant Contact.
