ALTER TABLE tasks
    ADD COLUMN parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    ADD COLUMN blocked_by UUID REFERENCES tasks(id) ON DELETE SET NULL,
    ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none',
    ADD CONSTRAINT tasks_recurrence CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
    ADD CONSTRAINT tasks_no_self_link CHECK (parent_id IS DISTINCT FROM id AND blocked_by IS DISTINCT FROM id);

CREATE INDEX tasks_parent_idx ON tasks (parent_id) WHERE parent_id IS NOT NULL
