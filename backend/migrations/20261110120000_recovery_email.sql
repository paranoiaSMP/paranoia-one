-- Adresse perso de secours: reçoit les mails de sécurité, car la boîte @paranoiastudio.fr n'est lisible que par le staff.
ALTER TABLE users
    ADD COLUMN recovery_email TEXT,
    ADD CONSTRAINT users_recovery_email_length CHECK (recovery_email IS NULL OR char_length(recovery_email) BETWEEN 3 AND 320);
