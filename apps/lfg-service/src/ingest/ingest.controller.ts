import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsObject, IsString } from 'class-validator';
import { TenantGuard } from '../tenancy/tenant.guard';
import { Tenant } from '../tenancy/tenant.decorator';
import type { TenantContext } from '../tenancy/tenant.guard';
import { IngestService } from './ingest.service';

class SaveTemplateDto {
  @IsString() country: string;
  @IsObject() columnMap: Record<string, string>;
}

class RunBatchDto {
  @IsString() templateId: string;
  @IsIn(['upload', 'inject']) source: 'upload' | 'inject';
  @IsArray() rows: Record<string, unknown>[];
}

@Controller('ingest')
@UseGuards(TenantGuard)
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Get('templates')
  templates(@Tenant() t: TenantContext) {
    return this.ingest.listTemplates(t.growerId);
  }

  @Post('templates')
  saveTemplate(@Tenant() t: TenantContext, @Body() dto: SaveTemplateDto) {
    // Step 6 of the pipeline — saving the template is what makes Route 2 possible.
    return this.ingest.saveTemplate(t.growerId, dto.country, dto.columnMap);
  }

  @Post('batches')
  runBatch(@Tenant() t: TenantContext, @Body() dto: RunBatchDto) {
    return this.ingest.runBatch(t.silo, dto.source, dto.templateId, dto.rows);
  }

  @Get('batches')
  batches(@Tenant() t: TenantContext) {
    return [...t.silo.batches.values()];
  }

  @Post('batches/:id/rollback')
  rollback(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.ingest.rollback(t.silo, id);
  }
}
