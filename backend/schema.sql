CREATE TYPE role_t AS ENUM ('admin','base_commander','logistics_officer');

CREATE TABLE bases (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE equipment_types (
  id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('vehicle','weapon','ammunition')));
CREATE TABLE users (
  id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role role_t NOT NULL, base_id INT REFERENCES bases(id),
  CHECK (role = 'admin' OR base_id IS NOT NULL));   -- non-admins must belong to a base

-- Append-only event tables (no UPDATE/DELETE from the app => history is never lost)
CREATE TABLE purchases (
  id BIGSERIAL PRIMARY KEY, base_id INT NOT NULL REFERENCES bases(id),
  equipment_type_id INT NOT NULL REFERENCES equipment_types(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by INT REFERENCES users(id));
CREATE TABLE transfers (
  id BIGSERIAL PRIMARY KEY, from_base_id INT NOT NULL REFERENCES bases(id),
  to_base_id INT NOT NULL REFERENCES bases(id),
  equipment_type_id INT NOT NULL REFERENCES equipment_types(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by INT REFERENCES users(id),
  CHECK (from_base_id <> to_base_id));
CREATE TABLE assignments (
  id BIGSERIAL PRIMARY KEY, base_id INT NOT NULL REFERENCES bases(id),
  equipment_type_id INT NOT NULL REFERENCES equipment_types(id),
  quantity INT NOT NULL CHECK (quantity > 0), assigned_to TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by INT REFERENCES users(id));
CREATE TABLE expenditures (
  id BIGSERIAL PRIMARY KEY, base_id INT NOT NULL REFERENCES bases(id),
  equipment_type_id INT NOT NULL REFERENCES equipment_types(id),
  quantity INT NOT NULL CHECK (quantity > 0), reason TEXT,
  expended_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by INT REFERENCES users(id));
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY, user_id INT, role TEXT, method TEXT, path TEXT,
  status INT, body JSONB, ip TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE INDEX ON purchases (base_id, equipment_type_id, purchased_at);
CREATE INDEX ON transfers (from_base_id, transferred_at);
CREATE INDEX ON transfers (to_base_id, transferred_at);
CREATE INDEX ON assignments (base_id, assigned_at);
CREATE INDEX ON expenditures (base_id, expended_at);

-- One signed ledger over all events. Balances are derived, never stored,
-- so they cannot drift from the history.
CREATE VIEW movements AS
  SELECT base_id, equipment_type_id, purchased_at ts, 'purchase' kind, quantity qty FROM purchases
  UNION ALL SELECT to_base_id,   equipment_type_id, transferred_at, 'transfer_in',  quantity FROM transfers
  UNION ALL SELECT from_base_id, equipment_type_id, transferred_at, 'transfer_out', -quantity FROM transfers
  UNION ALL SELECT base_id, equipment_type_id, expended_at, 'expended', -quantity FROM expenditures
  UNION ALL SELECT base_id, equipment_type_id, assigned_at, 'assigned', quantity FROM assignments;
-- Initial stock is entered as a purchase dated before go-live.
