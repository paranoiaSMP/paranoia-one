CREATE TABLE workspace_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT workspace_invitations_email_length CHECK (char_length(email) BETWEEN 3 AND 320),
    CONSTRAINT workspace_invitations_role CHECK (role IN ('admin', 'member', 'viewer')),
    CONSTRAINT workspace_invitations_status CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
);

CREATE UNIQUE INDEX workspace_invitations_pending_idx
    ON workspace_invitations (workspace_id, email)
    WHERE status = 'pending';

CREATE INDEX workspace_invitations_email_idx ON workspace_invitations (email, status);
