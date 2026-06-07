-- Migre les codes d'invitation vers 8 caractères dérivés de l'UUID famille
UPDATE families
SET invite_code = upper(substring(replace(id::text, '-', '') from 1 for 8))
WHERE invite_code IS NULL
   OR length(invite_code) <> 8;
