-- Custom SQL migration file, put your code below! --
-- Rows written before `status` existed: an accepted candidate must not be
-- treated as pending (a re-scan deletes pending rows).
UPDATE "conventions" SET "status" = 'accepted' WHERE "accepted" = true AND "status" = 'pending';
