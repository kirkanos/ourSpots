/**
 * Seit Prisma 7 liegt die Werkzeug-Konfiguration hier statt im Schema: Pfade,
 * Migrationen und die Datenbankadresse. Umgebungsvariablen lädt Prisma nicht
 * mehr von sich aus – im Betrieb kommen sie aus dem Container, lokal legt
 * dotenv-cli sie davor.
 */
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Bewusst nicht env(): das wirft, sobald die Variable fehlt – und dann
    // liesse sich nicht einmal der Client erzeugen, obwohl dafür gar keine
    // Verbindung nötig ist (so etwa im Docker-Build). Migrationen scheitern
    // mit leerer Adresse ohnehin verständlich.
    url: process.env.DATABASE_URL ?? '',
  },
});
