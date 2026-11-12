CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id UUID,
    actor TEXT NOT NULL CHECK (char_length(actor) <= 320),
    action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 64),
    target TEXT NOT NULL DEFAULT '' CHECK (char_length(target) <= 200),
    ip TEXT CHECK (ip IS NULL OR char_length(ip) <= 64),
    detail TEXT NOT NULL DEFAULT '' CHECK (char_length(detail) <= 500)
);

CREATE INDEX audit_log_at_idx ON audit_log (id DESC);

CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;

CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

CREATE TABLE launcher_installs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
    token_hash BYTEA NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'revoque', 'a_supprimer', 'supprime')),
    version TEXT CHECK (version IS NULL OR char_length(version) <= 40),
    binary_hash TEXT CHECK (binary_hash IS NULL OR char_length(binary_hash) <= 128),
    last_seen TIMESTAMPTZ,
    last_ip TEXT CHECK (last_ip IS NULL OR char_length(last_ip) <= 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
