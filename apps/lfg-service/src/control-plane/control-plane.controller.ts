import { Body, Controller, Get, Headers, Post, Query, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { RegistryService } from './registry.service';

class OnboardGrowerDto {
  @IsString() id: string;
  @IsString() name: string;
  @IsString() region: string;
  @IsString() adminSub: string;
}

class MetricDefDto {
  @IsString() key: string;
  @IsOptional() @IsString() unit?: string;
  @IsIn(['number', 'text', 'enum', 'boolean']) valueType: 'number' | 'text' | 'enum' | 'boolean';
  @IsOptional() min?: number;
  @IsOptional() max?: number;
  @IsOptional() enumValues?: string[];
  @IsOptional() @IsString() crop?: string;
  @IsOptional() @IsString() country?: string;
  @IsInt() @Min(2000) sinceSeason: number;
}

/**
 * Platform-facing endpoints. In production these sit behind the platform_admin
 * role; identity comes from the external IdP token (verified via JWKS).
 * Here the "token" is the x-user-sub header — one comment, one swap point.
 */
@Controller('control-plane')
export class ControlPlaneController {
  constructor(private readonly registry: RegistryService) {}

  @Get('growers')
  listGrowers() {
    return this.registry.listGrowers();
  }

  @Post('growers')
  onboard(@Body() dto: OnboardGrowerDto) {
    return this.registry.onboardGrower(dto);
  }

  @Get('me/memberships')
  myMemberships(@Headers('x-user-sub') sub?: string) {
    if (!sub) throw new UnauthorizedException('missing identity (x-user-sub)');
    // This is what the UI's grower-picker renders after login.
    return this.registry.membershipsOf(sub);
  }

  @Get('metric-definitions')
  metricDefs(@Query('country') country?: string, @Query('crop') crop?: string) {
    return this.registry.listMetricDefs({ country, crop });
  }

  @Post('metric-definitions')
  addMetricDef(@Body() dto: MetricDefDto) {
    this.registry.addMetricDef({ ...dto, unit: dto.unit ?? null });
    return { ok: true };
  }
}
