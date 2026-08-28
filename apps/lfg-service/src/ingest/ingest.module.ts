import { Module } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { IngestController } from './ingest.controller';

@Module({
  providers: [IngestService],
  controllers: [IngestController],
})
export class IngestModule {}
