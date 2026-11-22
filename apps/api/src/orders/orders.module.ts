import { FinanceModule } from '../finance/finance.module';
import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { DispatchService } from './dispatch.service';

@Module({ imports: [FinanceModule], controllers: [OrdersController], providers: [OrdersService, DispatchService] })
export class OrdersModule {}
