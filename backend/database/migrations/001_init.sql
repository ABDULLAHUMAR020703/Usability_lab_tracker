-- Consumer Insights Hub - initial schema (SQLite)
-- IDs shown to users (CI-0001, P-0001, NDA-0001) come from id_sequences and are never reused.

CREATE TABLE id_sequences (
  name TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL DEFAULT 1
);
INSERT INTO id_sequences(name, next_value) VALUES ('research',1),('participant',1),('nda',1);

CREATE TABLE application_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE research_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#6D4AFF',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

CREATE TABLE research_subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES research_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE (category_id, name)
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

-- Configurable option lists: age_group, customer_type, digital_behaviour, customer_segment,
-- gender, digital_native, screen_suggestion, owner, priority, city, occupation ...
CREATE TABLE lookup_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  value TEXT NOT NULL COLLATE NOCASE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE (type, value)
);

CREATE TABLE research_studies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  research_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  category_id INTEGER NOT NULL REFERENCES research_categories(id),
  subcategory_id INTEGER REFERENCES research_subcategories(id),
  product_id INTEGER REFERENCES products(id),
  screen_topic TEXT,
  owner TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Critical')),
  location TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Review Screen','Approved','Scheduled','Completed')),
  notes TEXT,
  -- Results production is tracked separately from the research lifecycle
  results_status TEXT NOT NULL DEFAULT 'Not Started' CHECK (results_status IN ('Not Started','In Progress','Under Review','Completed')),
  results_description TEXT,
  key_insights TEXT,
  results_updated_at TEXT,
  results_completed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_studies_dates ON research_studies(start_date, end_date);
CREATE INDEX idx_studies_status ON research_studies(status);
CREATE INDEX idx_studies_results ON research_studies(results_status);
CREATE INDEX idx_studies_category ON research_studies(category_id);
CREATE INDEX idx_studies_product ON research_studies(product_id);
CREATE INDEX idx_studies_owner ON research_studies(owner COLLATE NOCASE);
CREATE INDEX idx_studies_archived ON research_studies(archived_at);

CREATE TABLE research_team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id INTEGER NOT NULL REFERENCES research_studies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (study_id, name)
);

CREATE TABLE research_participant_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id INTEGER NOT NULL REFERENCES research_studies(id) ON DELETE CASCADE,
  label TEXT,
  required_count INTEGER NOT NULL DEFAULT 1 CHECK (required_count >= 0),
  age_min INTEGER,
  age_max INTEGER,
  customer_type TEXT,
  digital_behaviour TEXT,
  gender TEXT,
  city TEXT,
  other_criteria TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_requirements_study ON research_participant_requirements(study_id);

CREATE TABLE participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  email TEXT,
  age INTEGER CHECK (age IS NULL OR (age >= 0 AND age < 130)),
  age_group TEXT,
  gender TEXT,
  city TEXT,
  occupation TEXT,
  registration_date TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_participants_phone ON participants(phone_normalized);
CREATE INDEX idx_participants_name ON participants(full_name COLLATE NOCASE);
CREATE INDEX idx_participants_archived ON participants(archived_at);

-- Flexible demographics: customer_segment, customer_type, digital_behaviour, digitally_native, product_usage, + any custom key
CREATE TABLE participant_demographics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE (participant_id, key)
);
CREATE INDEX idx_demographics_key_value ON participant_demographics(key, value);

CREATE TABLE study_participation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id INTEGER NOT NULL REFERENCES research_studies(id),
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  requirement_id INTEGER REFERENCES research_participant_requirements(id) ON DELETE SET NULL,
  participation_date TEXT,
  attendance_status TEXT NOT NULL DEFAULT 'Expected' CHECK (attendance_status IN ('Expected','Confirmed','Attended','Did Not Attend','Cancelled')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (study_id, participant_id)
);
CREATE INDEX idx_participation_participant ON study_participation(participant_id);
CREATE INDEX idx_participation_study ON study_participation(study_id);
CREATE INDEX idx_participation_requirement ON study_participation(requirement_id);

CREATE TABLE nda_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('docx','pdf')),
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  notes TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_one_active_template ON nda_templates(is_active) WHERE is_active = 1;

CREATE TABLE nda_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nda_code TEXT NOT NULL UNIQUE,
  participation_id INTEGER NOT NULL REFERENCES study_participation(id),
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  study_id INTEGER NOT NULL REFERENCES research_studies(id),
  template_id INTEGER NOT NULL REFERENCES nda_templates(id),
  template_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Signed')),
  draft_pdf_path TEXT,
  draft_html TEXT,
  document_sha256 TEXT,
  signing_method TEXT CHECK (signing_method IS NULL OR signing_method IN ('drawn','typed')),
  signed_name TEXT,
  signature_image_path TEXT,
  signed_at TEXT,
  pdf_path TEXT,
  pdf_sha256 TEXT,
  evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (status = 'Pending' OR (signed_at IS NOT NULL AND pdf_path IS NOT NULL AND signing_method IS NOT NULL))
);
CREATE INDEX idx_nda_participation ON nda_records(participation_id);
CREATE INDEX idx_nda_participant ON nda_records(participant_id);
CREATE INDEX idx_nda_study ON nda_records(study_id);
CREATE INDEX idx_nda_status ON nda_records(status);

-- Signed NDAs are immutable evidence
CREATE TRIGGER trg_nda_signed_no_update BEFORE UPDATE ON nda_records
WHEN OLD.status = 'Signed'
BEGIN SELECT RAISE(ABORT, 'Signed NDA records are immutable'); END;
CREATE TRIGGER trg_nda_signed_no_delete BEFORE DELETE ON nda_records
WHEN OLD.status = 'Signed'
BEGIN SELECT RAISE(ABORT, 'Signed NDA records cannot be deleted'); END;

CREATE TABLE research_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id INTEGER NOT NULL REFERENCES research_studies(id),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'deliverables' CHECK (folder IN ('documents','findings','deliverables')),
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT,
  description TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attachments_study ON research_attachments(study_id);

CREATE TABLE research_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_id INTEGER REFERENCES research_studies(id),
  participant_id INTEGER REFERENCES participants(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_study ON research_activity_log(study_id, created_at);
CREATE INDEX idx_activity_participant ON research_activity_log(participant_id, created_at);
CREATE INDEX idx_activity_created ON research_activity_log(created_at);

CREATE TABLE backup_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('auto','manual','archive','safety')),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  verification_detail TEXT,
  verified_at TEXT,
  keep_forever INTEGER NOT NULL DEFAULT 0 CHECK (keep_forever IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
