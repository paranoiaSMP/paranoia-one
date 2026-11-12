ALTER TABLE events ADD COLUMN reminded_at TIMESTAMPTZ;

ALTER TABLE notifications DROP CONSTRAINT notifications_kind;

ALTER TABLE notifications ADD CONSTRAINT notifications_kind
    CHECK (kind IN ('comment', 'assignment', 'invitation', 'reminder'))
