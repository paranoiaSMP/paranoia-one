CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    event_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT events_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
    CONSTRAINT events_description_length CHECK (char_length(description) <= 10000),
    CONSTRAINT events_time_order CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE INDEX events_owner_date_idx ON events (owner_id, event_date, start_time);
