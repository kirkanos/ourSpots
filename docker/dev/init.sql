-- `prisma migrate dev` legt zum Abgleich eine temporaere Schattendatenbank an
-- und braucht dafuer Rechte ausserhalb der eigentlichen Datenbank.
-- Nur fuer die lokale Entwicklung; im Betrieb laeuft ausschliesslich
-- `prisma migrate deploy`, das ohne Schattendatenbank auskommt.
GRANT ALL PRIVILEGES ON `prisma_migrate_shadow_db%`.* TO 'ourspots'@'%';
FLUSH PRIVILEGES;
