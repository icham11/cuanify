DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'production_stage') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'production_stage'
        AND e.enumlabel = 'listing'
    ) AND NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'production_stage'
        AND e.enumlabel = 'lining'
    ) THEN
      ALTER TYPE production_stage RENAME VALUE 'listing' TO 'lining';
    ELSIF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'production_stage'
        AND e.enumlabel = 'lining'
    ) THEN
      ALTER TYPE production_stage ADD VALUE 'lining';
    END IF;
  END IF;
END $$;

ALTER TABLE production_tasks
  DROP CONSTRAINT IF EXISTS production_tasks_stage_check;

UPDATE production_tasks
SET stage = 'lining'
WHERE stage::text = 'listing';

ALTER TABLE production_tasks
  ADD CONSTRAINT production_tasks_stage_check
  CHECK (stage::text IN ('lining', 'filling', 'finishing'));
