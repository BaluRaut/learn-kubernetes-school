import { Global, Module, OnModuleInit } from '@nestjs/common';
import { AwsService } from './aws.service';

@Global()
@Module({ providers: [AwsService], exports: [AwsService] })
export class AwsModule implements OnModuleInit {
  constructor(private readonly aws: AwsService) {}
  async onModuleInit() {
    await this.aws.ensureInfra();
  }
}
