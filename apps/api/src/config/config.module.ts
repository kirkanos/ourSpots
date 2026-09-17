import { Global, Module } from '@nestjs/common';
import { CONFIG, loadConfig } from './app-config';

@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: loadConfig }],
  exports: [CONFIG],
})
export class ConfigModule {}
