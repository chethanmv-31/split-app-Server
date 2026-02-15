import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { UsersModule } from '../users/users.module';
import { PushNotificationService } from '../common/push-notifications.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../common/supabase/supabase.module';

@Module({
    imports: [UsersModule, AuthModule, SupabaseModule],
    providers: [ExpensesService, PushNotificationService],
    controllers: [ExpensesController],
    exports: [ExpensesService],
})
export class ExpensesModule { }
