import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { SupabaseModule } from '../common/supabase/supabase.module';

@Module({
    imports: [UsersModule, AuthModule, SupabaseModule],
    controllers: [GroupsController],
    providers: [GroupsService],
})
export class GroupsModule { }
