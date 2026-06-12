-- Advisor hardening: notify_push_event() is a trigger function and should
-- never be directly executable by client roles. (PostgREST already refuses
-- trigger-returning functions, so this is belt-and-suspenders.)

REVOKE ALL ON FUNCTION settleup.notify_push_event() FROM PUBLIC, anon, authenticated;
