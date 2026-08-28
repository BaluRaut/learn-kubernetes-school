import { Global, Module } from '@nestjs/common';
import { RegistryService } from './registry.service';
import { ControlPlaneController } from './control-plane.controller';

@Global() // the registry is needed by the tenant guard everywhere
@Module({
  providers: [RegistryService],
  controllers: [ControlPlaneController],
  exports: [RegistryService],
})
export class ControlPlaneModule {}
