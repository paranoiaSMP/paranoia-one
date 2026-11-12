CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notes_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
    CONSTRAINT notes_content_length CHECK (char_length(content) <= 100000)
);

CREATE INDEX notes_owner_updated_idx ON notes (owner_id, updated_at DESC);
