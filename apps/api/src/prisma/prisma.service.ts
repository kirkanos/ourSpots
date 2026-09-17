import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { AppConfig, CONFIG } from '../config/app-config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(CONFIG) config: AppConfig) {
    // Seit Prisma 7 läuft die Verbindung über einen Treiber-Adapter statt über
    // die eingebaute Engine; die Adresse kommt damit nicht mehr aus dem Schema,
    // sondern von hier.
    super({ adapter: new PrismaMariaDb(config.DATABASE_URL) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Datenbankverbindung steht');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
