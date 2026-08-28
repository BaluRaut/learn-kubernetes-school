import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { TenantGuard } from '../tenancy/tenant.guard';
import { Tenant } from '../tenancy/tenant.decorator';
import type { TenantContext } from '../tenancy/tenant.guard';

class CreateFarmDto {
  @IsString() name: string;
  @IsString() country: string; // country lives on the FARM (multi-country growers)
}

class CreateFieldDto {
  @IsString() farmId: string;
  @IsString() name: string;
  @IsOptional() @IsString() externalRef?: string;
  @IsOptional() boundary?: unknown; // GeoJSON in production, PostGIS-validated
}

/** Canonical entities — every route runs behind the tenant guard. */
@Controller()
@UseGuards(TenantGuard)
export class CanonicalController {
  @Get('farms')
  listFarms(@Tenant() t: TenantContext) {
    return t.repo.listFarms();
  }

  @Post('farms')
  createFarm(@Tenant() t: TenantContext, @Body() dto: CreateFarmDto) {
    return t.repo.createFarm(dto.name, dto.country);
  }

  @Get('fields')
  listFields(@Tenant() t: TenantContext) {
    return t.repo.listFields();
  }

  @Post('fields')
  async createField(@Tenant() t: TenantContext, @Body() dto: CreateFieldDto) {
    const farm = await t.repo.getFarm(dto.farmId);
    if (!farm) throw new NotFoundException(`unknown farm ${dto.farmId}`);
    const field = await t.repo.createField(dto);
    if (dto.externalRef) await t.repo.setAlias(dto.externalRef, field.id);
    return field;
  }

  /** field_season_metric rows — the metrics-as-rows model, filterable at source. */
  @Get('metrics')
  metrics(
    @Tenant() t: TenantContext,
    @Query('fieldId') fieldId?: string,
    @Query('metricKey') metricKey?: string,
    @Query('season') season?: string,
  ) {
    return t.repo.queryMetrics({ fieldId, metricKey, seasonYear: season ? Number(season) : undefined });
  }

  /** Zoning vintages for a field; default = latest complete window. */
  @Get('fields/:id/zoning')
  async zoning(@Tenant() t: TenantContext, @Param('id') id: string, @Query('all') all?: string) {
    const vintages = (await t.repo.listVintages(id)).sort(
      (a, b) => b.windowEnd - a.windowEnd || b.createdAt.localeCompare(a.createdAt),
    );
    if (all === 'true') return vintages;
    const current = vintages.find((v) => !v.supersededBy);
    if (!current) throw new NotFoundException(`no zoning for field ${id}`);
    return current;
  }
}
