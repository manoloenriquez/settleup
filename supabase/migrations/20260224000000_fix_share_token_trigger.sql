-- Fix set_group_share_token trigger: replace gen_random_bytes (extensions schema,
-- hidden by SET search_path = settleup) with gen_random_uuid() (pg_catalog, always visible).

CREATE OR REPLACE FUNCTION settleup.set_group_share_token()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = settleup AS $$
BEGIN
  IF NEW.share_token IS NULL THEN
    NEW.share_token := replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;
