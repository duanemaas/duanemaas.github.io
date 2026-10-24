# Constant Contact in MCS SalesTrackR

These scripts give the **MCS SalesTrackR** file its own Constant Contact
connection and mark every subscribed member of a list, by default
**AllContact11525**, as `CC_subscribed` = 1.

| File | Script name | What it does |
|---|---|---|
| `check-constant-contact-connection.xml` | Check Constant Contact Connection | Tests the API and refreshes the access token. Same as the Social Media Manager version, minus the window-naming call |
| `mark-cc-list-subscribed.xml` | Mark CC List Subscribed | Reads the list from Constant Contact, finds each member by email, and sets `CC_subscribed` to 1 |

Paste them in that order. Copy from the file itself, not from a browser.

## Setup in MCS SalesTrackR

1. **CONSTANTC table.** Copy it from Social Media Manager: in Manage Database,
   copy the table on the Tables tab and paste it into MCS SalesTrackR. Give it a
   layout named `CONSTANTC` with one record. The four fields used are
   `CC_ClientID`, `CC_ClientSecret`, `CC_AccessToken` and `CC_RefreshToken`.
2. **Move the login.** Copy the four values from Social Media Manager's
   CONSTANTC record into the new one. **After that, stop running the Constant
   Contact scripts in Social Media Manager.** Constant Contact issues a new
   refresh token every time one is used, so the first file to refresh the token
   breaks the other file's login.
3. **CC_subscribed.** Add a number field to the contacts table if it isn't
   there yet.
4. **Check the settings** at the top of Mark CC List Subscribed:

   | Variable | Default |
   |---|---|
   | `$contactsLayout` | `CONTACTS` |
   | `$emailField` | `CONTACTS::Email` |
   | `$flagField` | `CONTACTS::CC_subscribed` |
   | `$settingsLayout` | `CONSTANTC` |

   The layout must show the contacts table, and the email field must hold the
   email address itself.

## Running it

Run **Mark CC List Subscribed** from any layout. To use another list, pass its
name as the script parameter.

- Members who unsubscribed in Constant Contact are skipped.
- Every contact record with a matching email is marked, including duplicates.
- The script only ever sets the field to 1. It never clears it.
- Emails with no match in MCS SalesTrackR are shown at the end. The full list is
  kept in `$$CC_Unmatched` until the file is closed.
