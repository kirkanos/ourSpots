import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels(config.LOG_LEVEL),
  });

  app.setGlobalPrefix('api');
  // Der Reverse Proxy terminiert TLS; ohne das steht in req.ip nur die
  // Container-IP und secure-Cookies würden falsch bewertet.
  app.set('trust proxy', 1);

  app.use(cookieParser(config.SESSION_SECRET));
  app.use(
    helmet({
      // Die Auslieferung der SPA übernimmt nginx; hier zählt nur die API.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  await app.listen(config.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API läuft auf Port ${config.PORT} (${config.NODE_ENV})`);
}

function logLevels(level: string): ('error' | 'warn' | 'log' | 'debug' | 'verbose')[] {
  const all = ['error', 'warn', 'log', 'debug', 'verbose'] as const;
  const index = all.indexOf(level as (typeof all)[number]);
  return [...all.slice(0, index < 0 ? 3 : index + 1)];
}

void bootstrap();
