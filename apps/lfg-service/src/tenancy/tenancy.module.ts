import { Global, Module } from '@nestjs/common';
import { SiloManager } from './silo.manager';
import { TenantGuard } from './tenant.guard';

@Global()
@Module({
  providers: [SiloManager, TenantGuard],
  exports: [SiloManager, TenantGuard],
})
export class TenancyModule {}
