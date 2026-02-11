import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { UsersModule } from '../users/users.module';
import { PushNotificationService } from '../common/push-notifications.service';

@Module({
    imports: [UsersModule],
    providers: [ExpensesService, PushNotificationService],
    controllers: [ExpensesController],
    exports: [ExpensesService],
})
export class ExpensesModule { }
