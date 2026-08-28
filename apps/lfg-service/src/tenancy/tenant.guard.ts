import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RegistryService } from '../control-plane/registry.service';
import { SiloManager } from './silo.manager';
import { SiloRepo } from './silo.repo';
import { Role } from '../control-plane/types';

export interface TenantContext {
  growerId: string;
  sub: string;
  role: Role;
  repo: SiloRepo;
}

/**
 * The tenant guard — design doc "three sources, three jobs":
 *   WHO   = the external IdP token. Simulated here by the x-user-sub header;
 *           the production swap is verifyIdpJwt(req) against the IdP's JWKS.
 *   WHICH = the X-Grower-Id header — untrusted input,
 *   MAY   = ...validated against the membership table on EVERY request.
 * A non-member gets 403 before any handler runs.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly registry: RegistryService,
    private readonly silos: SiloManager,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const sub = req.headers['x-user-sub'] as string | undefined; // prod: JWKS-verified token
    const growerId = req.headers['x-grower-id'] as string | undefined;

    if (!sub) throw new UnauthorizedException('missing identity (x-user-sub)');
    if (!growerId) throw new ForbiddenException('missing X-Grower-Id header');

    const membership = this.registry.membershipFor(sub, growerId); // prod: cached ~60 s
    if (!membership) throw new ForbiddenException(`no membership for ${growerId}`);

    const tenant: TenantContext = {
      growerId,
      sub,
      role: membership.role,
      repo: await this.silos.forGrower(growerId),
    };
    req.tenant = tenant;
    return true;
  }
}
