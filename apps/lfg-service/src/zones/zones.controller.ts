import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantGuard } from '../tenancy/tenant.guard';
import { Tenant } from '../tenancy/tenant.decorator';
import type { TenantContext } from '../tenancy/tenant.guard';
import { ZoneJobsService } from './zone-jobs.service';

class EnqueueZoneJobDto {
  @IsString() fieldId: string;
  @IsInt() @Min(2000) windowStart: number;
  @IsInt() @Min(2000) windowEnd: number;
  @IsOptional() @IsString() methodVersion?: string;
  @IsOptional() @IsIn(['interactive', 'backfill']) lane?: 'interactive' | 'backfill';
}

@Controller('zone-jobs')
@UseGuards(TenantGuard)
export class ZonesController {
  constructor(private readonly zoneJobs: ZoneJobsService) {}

  @Post()
  enqueue(@Tenant() t: TenantContext, @Body() dto: EnqueueZoneJobDto) {
    return this.zoneJobs.enqueue(t.repo, dto);
  }

  @Get()
  list(@Tenant() t: TenantContext) {
    return this.zoneJobs.list(t.repo);
  }

  @Get(':id')
  get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.zoneJobs.get(t.repo, id);
  }
}
