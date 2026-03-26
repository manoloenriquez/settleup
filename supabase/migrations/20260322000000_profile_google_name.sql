-- Update handle_new_user to populate full_name from Google OAuth metadata.
-- Backward-compatible: email/password users have no raw_user_meta_data so full_name stays NULL.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NULL
    )
  );
  RETURN NEW;
END;
$$;
