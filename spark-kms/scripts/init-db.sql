-- Runs once on first Docker Postgres boot (docker-entrypoint-initdb.d).
-- Enables pg_trgm on the primary db and provisions the test database.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE DATABASE spark_kms_test;
\connect spark_kms_test
CREATE EXTENSION IF NOT EXISTS pg_trgm;
