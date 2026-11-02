-- TalentScreen AI compact-v2: EXACTLY NINE application tables.
-- Executable design loaded by the compact-v2 Alembic migration.
-- Run only in an empty schema with search_path set by the caller.
-- PostgreSQL 16. No extension or second database engine is required.

CREATE FUNCTION valid_rubric(config jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; codes text[] := ARRAY[]::text[]; total numeric := 0;
BEGIN
  IF jsonb_typeof(config) IS DISTINCT FROM 'object'
     OR config->>'schemaVersion' IS DISTINCT FROM 'rubric-v2'
     OR jsonb_typeof(config->'criteria') IS DISTINCT FROM 'array'
     OR jsonb_array_length(config->'criteria') = 0
     OR jsonb_typeof(config->'jobSkills') IS DISTINCT FROM 'array'
     OR jsonb_typeof(config->'targetRole') IS DISTINCT FROM 'object'
     OR jsonb_typeof(config->'disqualifiers') IS DISTINCT FROM 'array'
     OR jsonb_typeof(config->'thresholds') IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(config->'criteria') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR COALESCE(item->>'code', '') = '' OR (item->>'code') = ANY(codes)
       OR COALESCE(item->>'pillar', '') NOT IN ('skills','experience','projects','systems','education')
       OR jsonb_typeof(item->'weight') IS DISTINCT FROM 'number'
       OR (item->>'weight')::numeric < 0 THEN RETURN false; END IF;
    codes := array_append(codes, item->>'code');
    total := total + (item->>'weight')::numeric;
  END LOOP;
  IF total <> 100 THEN RETURN false; END IF;
  IF jsonb_typeof(config#>'{thresholds,review_needed}') IS DISTINCT FROM 'number'
     OR jsonb_typeof(config#>'{thresholds,recommend}') IS DISTINCT FROM 'number'
     OR jsonb_typeof(config#>'{thresholds,strong_recommend}') IS DISTINCT FROM 'number' THEN
    RETURN false;
  END IF;
  RETURN 0 <= (config#>>'{thresholds,review_needed}')::numeric
     AND (config#>>'{thresholds,review_needed}')::numeric < (config#>>'{thresholds,recommend}')::numeric
     AND (config#>>'{thresholds,recommend}')::numeric < (config#>>'{thresholds,strong_recommend}')::numeric
     AND (config#>>'{thresholds,strong_recommend}')::numeric <= 100;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;

-- 1. One local operator. No organization/team/RBAC join graph.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  email varchar(254) NOT NULL CHECK (length(btrim(email)) > 0),
  password_hash text NOT NULL,
  full_name varchar(180) NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(preferences) = 'object'),
  token_version integer NOT NULL DEFAULT 1 CHECK (token_version > 0),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_ci ON users (lower(email));

-- 2. Role identity and editable catalog metadata, not a scoring snapshot.
CREATE TABLE job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(180) NOT NULL CHECK (length(btrim(title)) > 0),
  description text NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Every edit creates a new immutable scoring configuration.
CREATE TABLE scoring_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  config jsonb NOT NULL CHECK (valid_rubric(config)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, version),
  UNIQUE (id, job_id)
);

-- 4. One upload session pins one job and rubric version.
CREATE TABLE screening_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  rubric_id uuid NOT NULL,
  name varchar(180) NOT NULL,
  idempotency_key uuid NOT NULL UNIQUE,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (rubric_id, job_id) REFERENCES scoring_rubrics(id, job_id) ON DELETE RESTRICT
);
CREATE INDEX batches_role_created ON screening_batches(job_id, created_at DESC);
CREATE INDEX batches_rubric ON screening_batches(rubric_id);

-- 5. A source file, not a global person record. Same bytes may be reused.
CREATE TABLE resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 char(64) NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text,
  storage_status varchar(16) NOT NULL DEFAULT 'available' CHECK (storage_status IN ('available','purged')),
  mime_type varchar(120) NOT NULL CHECK (mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain')),
  file_size_bytes integer NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  display_name varchar(180),
  email varchar(254),
  phone varchar(50),
  identity_metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(identity_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((storage_status = 'available' AND storage_path IS NOT NULL AND length(storage_path) > 0)
      OR (storage_status = 'purged' AND storage_path IS NULL))
);

-- 6. Each accepted file in an upload session has one stable item id.
CREATE TABLE batch_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES screening_batches(id) ON DELETE RESTRICT,
  resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE RESTRICT,
  source_filename varchar(255) NOT NULL CHECK (length(btrim(source_filename)) > 0),
  hr_decision varchar(24) CHECK (hr_decision IN ('pending','shortlisted','rejected','reviewed')),
  reviewed_result_id uuid,
  hr_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, resume_id),
  CHECK ((reviewed_result_id IS NULL AND hr_decision IS NULL AND reviewed_at IS NULL AND hr_note IS NULL)
      OR (reviewed_result_id IS NOT NULL AND hr_decision IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX batch_files_resume ON batch_files(resume_id);

-- 7. The ONLY document read by the AI adapter; identity is not stored here.
CREATE TABLE screening_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_file_id uuid NOT NULL REFERENCES batch_files(id) ON DELETE RESTRICT,
  schema_version varchar(32) NOT NULL DEFAULT 'screening-v2' CHECK (schema_version = 'screening-v2'),
  privacy_mode varchar(24) NOT NULL CHECK (privacy_mode IN ('strict_local','redacted_remote')),
  payload jsonb NOT NULL,
  payload_sha256 char(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, batch_file_id),
  UNIQUE (batch_file_id, payload_sha256, schema_version),
  CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 262144),
  CHECK (payload - ARRAY['schemaVersion','resumeEvidence','targetRole','jobSkills','rubricCriteria','privacy','retrievalContext']::text[] = '{}'::jsonb),
  CHECK ((payload->>'schemaVersion') IS NOT DISTINCT FROM schema_version),
  CHECK (jsonb_typeof(payload->'resumeEvidence') IS NOT DISTINCT FROM 'object'),
  CHECK (jsonb_typeof(payload->'targetRole') IS NOT DISTINCT FROM 'object'),
  CHECK (jsonb_typeof(payload->'jobSkills') IS NOT DISTINCT FROM 'array'),
  CHECK (jsonb_typeof(payload->'rubricCriteria') IS NOT DISTINCT FROM 'array'),
  CHECK ((payload#>>'{privacy,mode}') IS NOT DISTINCT FROM privacy_mode),
  CHECK ((payload#>'{privacy,directContactPiiSent}') IS NOT DISTINCT FROM 'false'::jsonb)
);

-- 8. Append a new attempt on retry. Never overwrite a finished assessment.
CREATE TABLE screening_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_file_id uuid NOT NULL REFERENCES batch_files(id) ON DELETE RESTRICT,
  document_id uuid,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  idempotency_key uuid NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  outcome varchar(24) CHECK (outcome IN ('scored','review_required','out_of_scope')),
  grounded_profile jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(grounded_profile) = 'object'),
  score_breakdown jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(score_breakdown) = 'array'),
  total_score numeric(5,2) CHECK (total_score BETWEEN 0 AND 100),
  confidence numeric(5,2) CHECK (confidence BETWEEN 0 AND 100),
  recommendation varchar(24) CHECK (recommendation IN ('strong_recommend','recommend','review_needed','reject')),
  is_disqualified boolean NOT NULL DEFAULT false,
  review_reasons jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(review_reasons) = 'array'),
  provider_name varchar(80),
  model_name varchar(120),
  prompt_version varchar(80),
  scoring_version varchar(80),
  trace_id varchar(80) NOT NULL,
  error_code varchar(80),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (id, batch_file_id),
  UNIQUE (batch_file_id, attempt_no),
  FOREIGN KEY (document_id, batch_file_id) REFERENCES screening_documents(id, batch_file_id) ON DELETE RESTRICT,
  CHECK (status <> 'running' OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND started_at IS NOT NULL)),
  CHECK ((status IN ('queued','running') AND finished_at IS NULL) OR (status IN ('succeeded','failed','cancelled') AND finished_at IS NOT NULL)),
  CHECK (finished_at IS NULL OR finished_at >= created_at),
  CHECK (status <> 'failed' OR error_code IS NOT NULL),
  CHECK (status <> 'succeeded' OR (document_id IS NOT NULL AND outcome IS NOT NULL AND provider_name IS NOT NULL AND model_name IS NOT NULL AND prompt_version IS NOT NULL AND scoring_version IS NOT NULL AND error_code IS NULL)),
  CHECK (status = 'succeeded' OR (total_score IS NULL AND recommendation IS NULL AND outcome IS NULL)),
  CHECK (outcome IS DISTINCT FROM 'scored' OR (total_score IS NOT NULL AND recommendation IS NOT NULL)),
  CHECK (outcome IS DISTINCT FROM 'out_of_scope' OR (total_score IS NULL AND recommendation IS NULL)),
  CHECK ((total_score IS NULL) = (recommendation IS NULL))
);
CREATE UNIQUE INDEX one_active_attempt_per_file ON screening_results(batch_file_id) WHERE status IN ('queued','running');
CREATE INDEX latest_success_per_file ON screening_results(batch_file_id, attempt_no DESC) WHERE status = 'succeeded';
CREATE INDEX expired_processing_leases ON screening_results(lease_expires_at) WHERE status = 'running';
CREATE INDEX results_document ON screening_results(document_id);
ALTER TABLE batch_files ADD CONSTRAINT review_same_file
  FOREIGN KEY (reviewed_result_id, id) REFERENCES screening_results(id, batch_file_id) ON DELETE RESTRICT;
CREATE INDEX batch_files_reviewed_result ON batch_files(reviewed_result_id);

-- 9. Minimal operational events, no CV text/contact identifiers/provider secrets.
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(80) NOT NULL,
  resource_type varchar(40) NOT NULL,
  resource_id uuid,
  trace_id varchar(80) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_resource_time ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX audit_trace ON audit_logs(trace_id);

CREATE FUNCTION reject_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable snapshot: create a new version' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER rubric_immutable BEFORE UPDATE ON scoring_rubrics FOR EACH ROW EXECUTE FUNCTION reject_update();
CREATE TRIGGER document_immutable BEFORE UPDATE ON screening_documents FOR EACH ROW EXECUTE FUNCTION reject_update();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_update();

CREATE FUNCTION guard_result() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE cfg jsonb; doc jsonb; mode text; row_item jsonb; criterion jsonb;
        total numeric := 0; codes text[] := ARRAY[]::text[]; expected text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('succeeded','failed','cancelled') THEN
      RAISE EXCEPTION 'Finished attempt is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.batch_file_id <> OLD.batch_file_id OR NEW.attempt_no <> OLD.attempt_no
       OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.id <> OLD.id THEN
      RAISE EXCEPTION 'Attempt identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'running' AND NEW.status = 'queued' THEN
      RAISE EXCEPTION 'Expire then append a new attempt' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status <> 'succeeded' THEN RETURN NEW; END IF;
  SELECT r.config INTO cfg FROM batch_files f
    JOIN screening_batches b ON b.id = f.batch_id
    JOIN scoring_rubrics r ON r.id = b.rubric_id WHERE f.id = NEW.batch_file_id;
  SELECT payload, privacy_mode INTO doc, mode FROM screening_documents
    WHERE id = NEW.document_id AND batch_file_id = NEW.batch_file_id;
  IF doc IS NULL OR cfg IS NULL THEN
    RAISE EXCEPTION 'Exact source and document required' USING ERRCODE = '23514';
  END IF;
  IF mode = 'strict_local' AND NEW.provider_name <> 'local' THEN
    RAISE EXCEPTION 'Strict-local result cannot use remote provider' USING ERRCODE = '23514';
  END IF;
  IF doc->'targetRole' IS DISTINCT FROM cfg->'targetRole'
     OR doc->'jobSkills' IS DISTINCT FROM cfg->'jobSkills'
     OR doc->'rubricCriteria' IS DISTINCT FROM cfg->'criteria' THEN
    RAISE EXCEPTION 'Document differs from pinned rubric' USING ERRCODE = '23514';
  END IF;
  IF NEW.total_score IS NULL THEN RETURN NEW; END IF;
  IF jsonb_array_length(NEW.score_breakdown) <> jsonb_array_length(cfg->'criteria') THEN
    RAISE EXCEPTION 'Every rubric criterion needs a score entry' USING ERRCODE = '23514';
  END IF;
  FOR row_item IN SELECT value FROM jsonb_array_elements(NEW.score_breakdown) LOOP
    SELECT value INTO criterion FROM jsonb_array_elements(cfg->'criteria') WHERE value->>'code' = row_item->>'code';
    IF criterion IS NULL OR (row_item->>'code') = ANY(codes)
       OR jsonb_typeof(row_item->'earned') IS DISTINCT FROM 'number'
       OR jsonb_typeof(row_item->'max') IS DISTINCT FROM 'number'
       OR (row_item->>'max')::numeric <> (criterion->>'weight')::numeric
       OR (row_item->>'earned')::numeric < 0
       OR (row_item->>'earned')::numeric > (row_item->>'max')::numeric THEN
      RAISE EXCEPTION 'Invalid criterion score' USING ERRCODE = '23514';
    END IF;
    codes := array_append(codes, row_item->>'code');
    total := total + (row_item->>'earned')::numeric;
  END LOOP;
  IF NEW.total_score <> round(total, 2) THEN
    RAISE EXCEPTION 'Score total differs from breakdown' USING ERRCODE = '23514';
  END IF;
  expected := CASE WHEN NEW.is_disqualified THEN 'reject'
    WHEN NEW.total_score >= (cfg#>>'{thresholds,strong_recommend}')::numeric THEN 'strong_recommend'
    WHEN NEW.total_score >= (cfg#>>'{thresholds,recommend}')::numeric THEN 'recommend'
    WHEN NEW.total_score >= (cfg#>>'{thresholds,review_needed}')::numeric THEN 'review_needed'
    ELSE 'reject' END;
  IF NEW.recommendation IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Recommendation differs from rubric' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER result_integrity BEFORE INSERT OR UPDATE ON screening_results FOR EACH ROW EXECUTE FUNCTION guard_result();

-- Relational identities must not be silently reassigned after assessment.
CREATE FUNCTION guard_file_identity() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.batch_id <> OLD.batch_id OR NEW.resume_id <> OLD.resume_id
     OR NEW.source_filename <> OLD.source_filename THEN
    RAISE EXCEPTION 'Upload identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.reviewed_result_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM screening_results WHERE id = NEW.reviewed_result_id
      AND batch_file_id = NEW.id AND status = 'succeeded'
  ) THEN RAISE EXCEPTION 'Only this file successful result can be reviewed' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER file_identity BEFORE UPDATE ON batch_files FOR EACH ROW EXECUTE FUNCTION guard_file_identity();
CREATE TRIGGER batch_immutable BEFORE UPDATE ON screening_batches FOR EACH ROW EXECUTE FUNCTION reject_update();

CREATE FUNCTION guard_resume_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.sha256 <> OLD.sha256 OR NEW.mime_type <> OLD.mime_type
     OR NEW.file_size_bytes <> OLD.file_size_bytes
     OR (NEW.storage_path IS DISTINCT FROM OLD.storage_path AND NEW.storage_status <> 'purged') THEN
    RAISE EXCEPTION 'Source file identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER resume_identity BEFORE UPDATE ON resumes FOR EACH ROW EXECUTE FUNCTION guard_resume_identity();

-- Views are queries, not additional physical tables. One row per uploaded file.
CREATE VIEW current_file_results AS
SELECT f.id AS file_id, f.batch_id, f.resume_id, f.source_filename,
       b.job_id, b.rubric_id, r.display_name,
       ok.id AS result_id, ok.total_score, ok.recommendation, ok.outcome, ok.scoring_version,
       COALESCE(last_attempt.status, 'queued') AS latest_attempt_status,
       last_attempt.id AS latest_attempt_id,
       CASE WHEN ok.id IS NOT NULL THEN 'succeeded' ELSE COALESCE(last_attempt.status, 'queued') END AS file_status,
       f.hr_decision, (f.reviewed_result_id IS NOT NULL AND f.reviewed_result_id IS DISTINCT FROM ok.id) AS review_is_stale
FROM batch_files f JOIN screening_batches b ON b.id = f.batch_id
JOIN resumes r ON r.id = f.resume_id
LEFT JOIN LATERAL (SELECT id, total_score, recommendation, outcome, scoring_version
  FROM screening_results s WHERE s.batch_file_id = f.id AND s.status = 'succeeded'
  ORDER BY attempt_no DESC LIMIT 1) ok ON true
LEFT JOIN LATERAL (SELECT id, status FROM screening_results s WHERE s.batch_file_id = f.id
  ORDER BY attempt_no DESC LIMIT 1) last_attempt ON true;

CREATE VIEW batch_summary AS
SELECT b.id AS batch_id, count(f.file_id) AS total_files,
       count(f.file_id) FILTER (WHERE f.file_status = 'succeeded') AS successful,
       count(f.file_id) FILTER (WHERE f.file_status = 'failed') AS failed,
       count(f.file_id) FILTER (WHERE f.file_status IN ('queued','running')) AS pending,
       count(f.file_id) FILTER (WHERE f.file_status = 'cancelled') AS cancelled,
       count(f.file_id) FILTER (WHERE f.outcome IN ('review_required','out_of_scope')) AS needs_review
FROM screening_batches b LEFT JOIN current_file_results f ON f.batch_id = b.id GROUP BY b.id;
