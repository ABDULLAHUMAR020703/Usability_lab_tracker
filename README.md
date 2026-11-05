# Consumer Insights Hub

Internal research-management app for the JazzCash Consumer Insights team: research planning and calendar, participant CRM, per-study NDA signing, results & deliverables, analytics, and local backup/restore.

Single user, single laptop, **everything stored locally** (SQLite + local folders). No cloud, SharePoint, Outlook or Power Platform.

## Quick start (Windows)

1. Install **Node.js 22.13 or newer** (https://nodejs.org). Tested on Node 24.
2. Double-click **`start.bat`**.
   First run installs dependencies and builds the interface (a few minutes), then opens <http://localhost:4000>.

macOS/Linux: `./start.sh`.

Manual steps if you prefer:

```bash
npm run setup      # install backend + frontend dependencies
npm run build      # build the React interface
npm run init-db    # optional - the database is also created automatically on first start
npm start          # http://localhost:4000
```

Development (hot reload): `npm run dev` → <http://localhost:5173>.
Self-test against a throw-away data folder (never touches your data): `npm test`.

## Configuration (`.env`)

`start.bat` copies `.env.example` to `.env`. Key settings:

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `./data` | SQLite database (`consumer_insights.db`) |
| `STORAGE_DIR` | `./storage` | Research files, participant files, NDA templates, signed NDAs |
| `BACKUP_DIR` | `./backups` | Backups (can also be changed in the app → Backups) |
| `PORT` / `HOST` | `4000` / `127.0.0.1` | The app only listens on this laptop |
| `MAX_UPLOAD_MB` | `100` | Per-file upload limit |

## Folder layout

```
frontend/   React + Vite source (built into frontend/dist, served by the backend)
backend/    Express REST API: routes/, services/, database/ (db.js, migrations/, seed.js), utils/
data/       consumer_insights.db  (runtime)
storage/    research/CI-0001/{documents,findings,deliverables}, participants/P-0001/signatures,
            ndas/{templates,signed/P-0001,drafts}, exports   (runtime)
backups/    2026-11-03/{consumer_insights.db, storage/, backup_metadata.json} ...
scripts/    init-db.js, dev.js, smoke-test.js
```

The frontend never touches the database or filesystem — only the REST API (`/api/...`). Stored file paths are relative to `STORAGE_DIR` and are validated against path traversal; uploaded names are sanitised and stored with generated prefixes.

## Using the app

* **Research Tracker / Calendar** — one record per study with one overall start/end date. Lifecycle: Draft → Review Screen → Approved → Scheduled → Completed (click a stage on the study page). Drag events on the calendar to reschedule, click a date to add a study, click an event for details. Overlaps are flagged but never block saving: a plain date overlap is shown as *Date overlap* (informational); an overlap that also shares an owner/team member or a participant on the same day (or an undated participation) is shown as a *Potential scheduling conflict*.
* **Participants** — one permanent `P-0001` profile per person, reused across studies; duplicate detection by phone/name. Assign to studies, to a sample segment, with attendance status. History lists every study and links back to it.
* **NDA** — Settings → NDA Template: upload the company-approved `.docx` or `.pdf`. On a study's Participants tab choose **Generate NDA** → read on screen → participant **draws** or **types** their name, confirms they read it and intend to sign → signed PDF is stored in `storage/ndas/signed/P-xxxx/` and linked to participant, study and participation. Signed PDFs/records are immutable (database triggers block edit/delete) and never overwritten; a new NDA creates a new record.
* **Results** — each study has a *separate* results status (Not Started / In Progress / Under Review / Completed), description, key insights, completion date and attachments (PPTX, PDF, XLSX, DOCX, images…). Research can be Completed while results are In Progress.
* **Backups** — automatic daily backup (consistent SQLite snapshot via `VACUUM INTO` + all files + checksummed manifest), manual and archival backups, verify, restore (verifies → makes a safety backup → swaps data → reopens), retention (default 30 days; archival backups are never auto-deleted).

### NDA template format

* **DOCX (recommended):** put placeholders in the Word document, e.g. `{{participant_name}}`, `{{participant_id}}`, `{{phone}}`, `{{email}}`, `{{age}}`, `{{city}}`, `{{occupation}}`, `{{research_title}}`, `{{research_id}}`, `{{product}}`, `{{screen_topic}}`, `{{category}}`, `{{research_owner}}`, `{{start_date}}`, `{{end_date}}`, `{{date}}`, `{{nda_id}}`. The legal wording and formatting are untouched. (When a placeholder is split across differently formatted runs, the paragraph takes the formatting of its first run.) The filled document is converted to PDF with **Microsoft Word** (Windows, auto-detected) or **LibreOffice** if installed; without either, a text-only PDF is produced — install one of them for full-fidelity formatting.
* **PDF:** original pages are kept unchanged; a signature page with participant/study details is appended.
* The signature page records signing time (UTC), method, template version, a SHA-256 fingerprint of the document that was shown and the consent statement. Extra evidence (IP, browser, timezone, typed name) is stored in the database. The app does **not** claim the signature is legally valid — use your company's approved e-signing process to decide that.

## Assumptions & decisions

* **Database:** Node's built-in `node:sqlite` (no native build step). All SQL sits behind `backend/database/db.js` (`all/get/run/tx`) so PostgreSQL can be introduced later. Migrations are the numbered `.sql` files in `backend/database/migrations` and are applied automatically.
* **Dashboard definitions:** *Planned* = Draft/Review Screen/Approved; *Upcoming* = not completed and starts after today; *Ongoing* = not completed and today is inside the date range; *Pending NDAs* = active (non-cancelled) participations without a signed NDA; *Results In Progress* = results status exactly "In Progress".
* Deleting research/participants **archives** them (restorable). Removing an attachment moves the file to `storage/research/_removed/`. Categories/products in use can be deactivated, not deleted. A participation that has a signed NDA cannot be removed (set it to Cancelled).
* Navigation has an extra **Analytics** item (Module 7) next to the seven requested items; Backups sit under *System*.
* No NDA template is bundled — legal text must come from you. Generating an NDA is blocked until one is uploaded.
* No login (single user, bound to `127.0.0.1`). Do not expose the port to a network until authentication is added.
* No sample data is created; only configuration defaults (categories, products, option lists).

## Backup advice

Backups in the default folder sit on the same disk as the app. For real protection set the backup folder to an **encrypted external drive** (Backups page → Backup folder, or `BACKUP_DIR` in `.env`). Restoring replaces the current database and files (a safety backup is created first).

## Future-ready (not implemented)

Outlook/Graph calendar sync, multi-user + roles, internal-server hosting, PostgreSQL, external e-signature provider: the service layer is separate from routes and the DB layer is abstracted, so these can be added without a rebuild.
