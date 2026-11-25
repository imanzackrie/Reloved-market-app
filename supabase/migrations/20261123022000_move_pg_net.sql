-- pg_net should not be in public schema
drop extension if exists pg_net;
create extension pg_net schema extensions;
