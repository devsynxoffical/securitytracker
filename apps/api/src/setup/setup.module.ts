import { Module } from '@nestjs/common';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';

/** First-run workspace creation (03 F29). */
@Module({
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
