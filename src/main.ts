import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  app.enableCors();
  app.useGlobalFilters(new HttpExceptionFilter());

  const basePort = Number(process.env.PORT || 3000);
  const maxAttempts = 10;
  let currentPort = basePort;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await app.listen(currentPort);
      console.log(`Application is running on: ${await app.getUrl()}`);
      return;
    } catch (error: any) {
      if (error?.code !== 'EADDRINUSE') {
        throw error;
      }
      currentPort += 1;
    }
  }

  throw new Error(`Unable to bind server port from ${basePort} to ${basePort + maxAttempts - 1}`);
}
bootstrap();
