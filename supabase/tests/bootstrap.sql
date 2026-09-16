-- CI/local disposable PostgreSQL only; never run against a linked project.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
