ALTER TABLE users
    ADD COLUMN display_name TEXT,
    ADD COLUMN avatar TEXT,
    ADD CONSTRAINT users_display_name_length CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 40),
    ADD CONSTRAINT users_avatar_size CHECK (avatar IS NULL OR (avatar LIKE 'data:image/%' AND char_length(avatar) <= 200000));
