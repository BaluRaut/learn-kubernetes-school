import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  healthz() {
    return { status: 'ok' };
  }

  @Get('readyz')
  readyz() {
    // With real silos this checks the control-plane DB + one pooled host.
    return { status: 'ready' };
  }
}
