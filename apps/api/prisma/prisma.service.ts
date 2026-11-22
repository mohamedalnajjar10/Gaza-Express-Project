import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient<{ omit: { product: { soldQuantity: true } } }> implements OnModuleInit, OnApplicationShutdown {
    constructor() {
        super({ omit: { product: { soldQuantity: true } } });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onApplicationShutdown() {
        await this.$disconnect();
    }
}
