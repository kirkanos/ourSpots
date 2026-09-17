import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './auth.constants';

/**
 * Markiert eine Route als ohne Login erreichbar – gebraucht fuer den
 * Health-Check, den Login-Flow selbst und die oeffentlichen Teilen-Links.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
