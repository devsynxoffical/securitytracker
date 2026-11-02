import { Module } from '@nestjs/common';

/**
 * File storage (02 D9): S3-compatible object storage with presigned URLs.
 * POST /files/presign and GET /files/:id (07 section 6). Providers are registered as built.
 */
@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class FilesModule {}
