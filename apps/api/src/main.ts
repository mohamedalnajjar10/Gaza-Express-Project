import { observeRequest } from './common/request-observability';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true, // Enable buffering for better log management
    logger: isProduction ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  // Only enable when the API is isolated behind our single trusted gateway.
  if (configService.get('TRUST_PROXY') === '1') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(observeRequest(configService.get('TRUST_PROXY') === '1'));

  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
  }));

  //Global Prefix for all routes
  const apiPrefix = configService.get('API_PREFIX') || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // Global Exception Filter
  app.useGlobalFilters(new GlobalExceptionFilter());
  // app.useGlobalGuards(new RolesGuard(app.get(Reflector)));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();
  app.useGlobalInterceptors(new ResponseInterceptor());


  // Enable CORS
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', 'http://localhost:8090').split(',').map(origin => origin.trim()).filter(Boolean),
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization, Idempotency-Key',
    maxAge: 3600,
  });

  // Swagger documentation (disabled in production)
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Gaza Express API')
      .setDescription('Comprehensive Gaza Express API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  const port = configService.get('PORT', 8090);
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Gaza Express API running on port ${port} (prefix: /${apiPrefix})`);
  if (!isProduction) {
    logger.log(`API Documentation: http://localhost:${port}/${apiPrefix}/docs`);
  }
}
bootstrap();
