CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'normal',
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tasks_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
    CONSTRAINT tasks_description_length CHECK (char_length(description) <= 100000),
    CONSTRAINT tasks_status CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
    CONSTRAINT tasks_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

CREATE INDEX tasks_owner_updated_idx ON tasks (owner_id, updated_at DESC);
