import { Module } from '@nestjs/common';
import { CanonicalController } from './canonical.controller';

@Module({ controllers: [CanonicalController] })
export class SilosModule {}
