import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { PublicTripDto, PublicTripListeDto } from '@ourspots/shared';
import { Public } from '../auth/public.decorator';
import { PhotosService } from '../photos/photos.service';
import { PublicService } from './public.service';

/**
 * Die Ansicht fuer Besucher ohne Konto.
 *
 * Jede Route traegt @Public und laeuft damit am Anmelde-Guard vorbei. Was hier
 * herauskommt, ist fuer die ganze Welt bestimmt -- entsprechend streng filtert
 * der Dienst dahinter.
 */
// Bewusst nicht unter 'public': Dort liegt seit jeher der Teilen-Link mit
// seinem Token (`public/:token`), und der wuerde '/public/trips' als Token
// mit dem Wert "trips" verstehen. Bestehende Teilen-Links duerfen nicht
// brechen, also weicht der neue Bereich aus.
@Controller('entdecken')
export class PublicController {
  constructor(
    private readonly oeffentlich: PublicService,
    private readonly photos: PhotosService,
  ) {}

  @Public()
  @Get('trips')
  liste(): Promise<PublicTripListeDto[]> {
    return this.oeffentlich.liste();
  }

  @Public()
  @Get('trips/:id')
  reise(@Param('id') id: string): Promise<PublicTripDto> {
    return this.oeffentlich.reise(id);
  }

  @Public()
  @Get('photos/:id')
  async foto(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const ablage = await this.oeffentlich.fotoAblage(id);
    const { stream, bytes } = await this.photos.openFile(ablage, 'medium');
    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes),
      // Unveraenderlich: Eine neue Fassung bekaeme eine neue Kennung.
      'Cache-Control': 'public, max-age=86400',
    });
    stream.pipe(res);
  }
}
