import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { TenantGuard } from '../tenancy/tenant.guard';
import { Tenant } from '../tenancy/tenant.decorator';
import type { TenantContext } from '../tenancy/tenant.guard';
import { SiloManager } from '../tenancy/silo.manager';

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
  constructor(private readonly silos: SiloManager) {}

  @Get('farms')
  listFarms(@Tenant() t: TenantContext) {
    return [...t.silo.farms.values()];
  }

  @Post('farms')
  createFarm(@Tenant() t: TenantContext, @Body() dto: CreateFarmDto) {
    const farm = { id: this.silos.nextId(t.silo, 'farm'), ...dto };
    t.silo.farms.set(farm.id, farm);
    return farm;
  }

  @Get('fields')
  listFields(@Tenant() t: TenantContext) {
    return [...t.silo.fields.values()];
  }

  @Post('fields')
  createField(@Tenant() t: TenantContext, @Body() dto: CreateFieldDto) {
    if (!t.silo.farms.has(dto.farmId)) throw new NotFoundException(`unknown farm ${dto.farmId}`);
    const field = { id: this.silos.nextId(t.silo, 'field'), ...dto };
    t.silo.fields.set(field.id, field);
    if (dto.externalRef) t.silo.entityAliases.set(dto.externalRef, field.id);
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
    return t.silo.factRows.filter(
      (r) =>
        (!fieldId || r.fieldId === fieldId) &&
        (!metricKey || r.metricKey === metricKey) &&
        (!season || r.seasonYear === Number(season)),
    );
  }

  /** Zoning vintages for a field; default = latest complete window. */
  @Get('fields/:id/zoning')
  zoning(@Tenant() t: TenantContext, @Param('id') id: string, @Query('all') all?: string) {
    const vintages = t.silo.zoningVintages
      .filter((v) => v.fieldId === id)
      .sort((a, b) => b.windowEnd - a.windowEnd || b.createdAt.localeCompare(a.createdAt));
    if (all === 'true') return vintages;
    const current = vintages.find((v) => !v.supersededBy);
    if (!current) throw new NotFoundException(`no zoning for field ${id}`);
    return current;
  }
}
