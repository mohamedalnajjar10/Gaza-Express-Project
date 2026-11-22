import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setTimeout } from 'node:timers/promises';
import { PrismaModule } from 'prisma/prisma.module';
import { createSmsProvider, SMS_PROVIDER } from './sms.provider';
import { SmsService } from './sms.service';
import { validateSmsEnvironment } from '../config/environment';
import { SmsWorker } from './sms.worker';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateSmsEnvironment, envFilePath: process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : ['.env', '../../.env']) }), PrismaModule],
  providers: [SmsService, SmsWorker, { provide: SMS_PROVIDER, useFactory: createSmsProvider, inject: [ConfigService] }],
})
class WorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { abortOnError: false, logger: false });
  const worker = app.get(SmsWorker);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (!stopping) {
      try {
        if (!(await worker.runOnce())) await setTimeout(500);
      } catch (error) {
        const kind = error instanceof Error ? error.name : 'UnknownError';
        process.stderr.write(JSON.stringify({ event: 'sms_worker_iteration_failed', kind }) + '\n');
        await setTimeout(1000);
      }
    }
  } finally {
    await app.close();
  }
}

void bootstrap().catch(() => {
  process.stderr.write('SMS worker could not start. Check database and SMS provider configuration.\n');
  process.exitCode = 1;
});
