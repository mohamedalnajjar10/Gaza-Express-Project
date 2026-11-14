import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

export function trackEndpoints(app: INestApplication) {
  const directory = process.env.WASLA_ENDPOINT_COVERAGE;
  if (!directory) return;
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  for (const [path, operations] of Object.entries(document.paths)) {
    for (const method of Object.keys(operations)) {
      if (/^(get|post|patch|put|delete)$/.test(method)) appendFileSync(join(directory, 'inventory'), `${method.toUpperCase()} ${path.replace(/\{([^}]+)\}/g, ':$1')}\n`);
    }
  }
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.once('finish', () => {
      if (typeof req.route?.path === 'string') appendFileSync(join(directory, 'hits'), `${req.method} ${req.route.path} ${res.statusCode}\n`);
    });
    next();
  });
}
