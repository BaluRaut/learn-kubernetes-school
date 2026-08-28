import { Module } from '@nestjs/common';
import { AwsModule } from './aws/aws.module';
import { ControlPlaneModule } from './control-plane/control-plane.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { SilosModule } from './silos/silos.module';
import { IngestModule } from './ingest/ingest.module';
import { ZonesModule } from './zones/zones.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AwsModule, ControlPlaneModule, TenancyModule, SilosModule, IngestModule, ZonesModule],
  controllers: [HealthController],
})
export class AppModule {}
