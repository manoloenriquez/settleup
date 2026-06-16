-- =============================================================================
-- Durable AI rate limiting
--
-- Keeps the AI request budget in Postgres instead of process memory so limits
-- survive restarts and apply consistently across multiple web instances.
-- =============================================================================

CREATE TABLE public.ai_rate_limits (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count     INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_rate_limits_select_own"
  ON public.ai_rate_limits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ai_rate_limits_insert_own"
  ON public.ai_rate_limits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_rate_limits_update_own"
  ON public.ai_rate_limits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_now            TIMESTAMPTZ := NOW();
  v_window         INTERVAL := INTERVAL '1 minute';
  v_limit          INTEGER := 10; -- keep in sync with packages/shared/src/constants/index.ts
  v_rate_limit     public.ai_rate_limits%ROWTYPE;
  v_retry_after_ms BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  LOOP
    SELECT *
    INTO v_rate_limit
    FROM public.ai_rate_limits
    WHERE user_id = v_user_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_now >= v_rate_limit.window_started_at + v_window THEN
        UPDATE public.ai_rate_limits
        SET window_started_at = v_now,
            request_count = 1,
            updated_at = v_now
        WHERE user_id = v_user_id;

        RETURN jsonb_build_object('allowed', TRUE, 'retry_after_ms', 0);
      END IF;

      IF v_rate_limit.request_count >= v_limit THEN
        v_retry_after_ms := GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM ((v_rate_limit.window_started_at + v_window) - v_now)) * 1000)::BIGINT
        );

        RETURN jsonb_build_object('allowed', FALSE, 'retry_after_ms', v_retry_after_ms);
      END IF;

      UPDATE public.ai_rate_limits
      SET request_count = request_count + 1,
          updated_at = v_now
      WHERE user_id = v_user_id;

      RETURN jsonb_build_object('allowed', TRUE, 'retry_after_ms', 0);
    END IF;

    BEGIN
      INSERT INTO public.ai_rate_limits (
        user_id,
        window_started_at,
        request_count,
        created_at,
        updated_at
      )
      VALUES (v_user_id, v_now, 1, v_now, v_now);

      RETURN jsonb_build_object('allowed', TRUE, 'retry_after_ms', 0);
    EXCEPTION
      WHEN unique_violation THEN
        -- Another request inserted the row first; retry and lock it.
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit() TO authenticated;
