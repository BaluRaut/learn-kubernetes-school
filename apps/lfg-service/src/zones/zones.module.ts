import { Module } from '@nestjs/common';
import { ZoneJobsService } from './zone-jobs.service';
import { ZonesController } from './zones.controller';

@Module({
  providers: [ZoneJobsService],
  controllers: [ZonesController],
})
export class ZonesModule {}
