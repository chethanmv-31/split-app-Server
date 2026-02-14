import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { DbModule } from '../common/db/db.module';

@Module({
    imports: [UsersModule, AuthModule, DbModule],
    controllers: [GroupsController],
    providers: [GroupsService],
})
export class GroupsModule { }
