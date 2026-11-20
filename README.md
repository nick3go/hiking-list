# Baje se hod v hribe...

Skupni seznam idej za pohode. Slovenski vmesnik, modro-zelena tema in podatki v Supabase.

- Dodajanje in urejanje: ime, država z zastavo, neobvezna zahtevnost, Instagram reel, Hribi.net in komentarji.
- Za dokončanje je obvezna povezava do Strava aktivnosti (tudi `strava.app.link`).
- Ločena seznama načrtovanih in prehojenih pohodov; iskanje in filtri.
- Vrnitev prehojenega pohoda med načrtovane; odstranitev z možnostjo razveljavitve.
- Samodejna osvežitev vsakih 30 sekund in preverjanje različice pri urejanju.

## Access model

There are intentionally **no accounts or passwords**. Anyone who discovers the page or API can read and edit the shared list. `noindex` asks search engines not to index the site; it is not access control.

Data lives in the `hikes_private` schema of the existing Supabase project. Keep that schema **out of the Data API exposed-schema list**. The public `hikes_api` RPC uses invoker permissions with explicit shared RLS policies; it never uses a service-role key or privileged definer code. This isolates the app's tables from other apps, but does not make the shared list confidential.

`database/schema.sql` records the applied schema and RPC. Run it only once in a new database. No existing app tables or API settings were changed. Deletes are soft deletes (`deleted_at`), not permanent erasure. The `version` column prevents silent overwrites when two devices change the same hike.

## Run / host

Serve the repository root with any static web server, for example:

```sh
python3 -m http.server 8000
```

No build step or JavaScript dependencies. The Supabase URL and **publishable** browser key are in `app.js`; these are public configuration. Never replace them with a secret or service-role key. Data requests use the native Fetch API. Fonts use Google Fonts, with local system-font fallbacks. All other visual assets are included.

To publish manually with GitHub Pages:

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Select branch **main** and folder **/ (root)**, then **Save**.

No Actions workflow or Sites hosting configuration is included.

## Verification

The deployed RPC was exercised as the anonymous database role for create, read, edit, complete, reopen, soft-delete and undo, including required-link and concurrent-edit validation. Transaction tests were rolled back. HTTP checks confirmed public RPC access and rejection of direct access to the private schema. Desktop browser checks cover real creation, editing, optional fields, required Strava input, completion and reopening. Mobile styles are included; a physical mobile device was not used for verification.
