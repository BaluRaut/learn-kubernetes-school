import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Unknown fields are rejected, not ignored (design doc §API security).
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // The demo console — a single static page, no build step.
  app.useStaticAssets(join(__dirname, '..', 'public'));
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`lfg-service listening on :${port} (UI at /)`);
}
bootstrap();
