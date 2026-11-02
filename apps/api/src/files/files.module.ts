import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';

/**
 * File storage (02 D9): S3-compatible object storage with presigned URLs.
 * POST /files/presign and GET /files/download (07 section 6).
 */
@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
