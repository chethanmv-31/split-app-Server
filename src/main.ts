import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const bodyLimit = process.env.BODY_LIMIT ?? '1mb';
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 60 * 60 * 24,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

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
