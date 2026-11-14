import { FinanceModule } from '../finance/finance.module';
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [FinanceModule], controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
