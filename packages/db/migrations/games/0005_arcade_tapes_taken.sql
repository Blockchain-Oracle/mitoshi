-- A run's seed is good for one score (R4-9 review, D-227; Senryo's `takeArcadeSeed`): the score check takes the seed
-- the moment it replays a run on it, so one issued tape never carries two posts, from one wallet or several.
ALTER TABLE arcade_tapes ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;
