import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

/**
 * Der AdminGuard steht ausdruecklich bei den Providern, obwohl er nur ueber
 * @UseGuards am Controller haengt. Ohne diesen Eintrag scheitert Nest schon
 * beim Einlesen der Module -- mit einem TypeError in Reflect.getMetadata, der
 * nicht im Entferntesten auf die Ursache zeigt.
 */
@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService],
})
export class AdminModule {}
