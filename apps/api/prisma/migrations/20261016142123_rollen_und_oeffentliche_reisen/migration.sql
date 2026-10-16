-- AlterTable
ALTER TABLE `Trip` ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `canRenderVideo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `role` VARCHAR(20) NOT NULL DEFAULT 'user';

-- Der aelteste Nutzer wird Admin, aber nur wenn es noch keinen gibt.
--
-- Bewusst ueber das Anlagedatum statt ueber eine fest eingetragene Kennung:
-- Die Migration laeuft auf jeder Installation, und eine hart hinterlegte
-- Adresse waere anderswo falsch. Wer die Anwendung aufgesetzt hat, hat sich
-- zuerst angemeldet.
--
-- Auf einer frischen Installation gibt es noch gar keinen Nutzer. Dort greift
-- der Anspruch ueber das Einrichtungstoken, das die API beim Start ins Log
-- schreibt, solange kein Admin vorhanden ist.
UPDATE `User`
   SET `role` = 'admin', `canRenderVideo` = 1
 WHERE `id` = (
         SELECT `id` FROM (
           SELECT `id` FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1
         ) AS erster
       )
   AND NOT EXISTS (
         SELECT 1 FROM (SELECT * FROM `User`) AS pruefung WHERE pruefung.`role` = 'admin'
       );
