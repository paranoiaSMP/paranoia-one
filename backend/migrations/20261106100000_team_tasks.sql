ALTER TABLE tasks
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX tasks_workspace_idx ON tasks (workspace_id) WHERE workspace_id IS NOT NULL;

CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT task_comments_body_length CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX task_comments_task_idx ON task_comments (task_id, created_at);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notifications_kind CHECK (kind IN ('comment', 'assignment', 'invitation'))
);

CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC)
