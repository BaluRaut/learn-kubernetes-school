import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from './tenant.guard';

/** Injects the request's TenantContext into a handler parameter. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext =>
    ctx.switchToHttp().getRequest().tenant,
);
