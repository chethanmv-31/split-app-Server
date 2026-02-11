import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { Group } from './group.entity';

@Controller('groups')
export class GroupsController {
    constructor(private readonly groupsService: GroupsService) { }

    @Get()
    async findAll(@Query('userId') userId?: string) {
        return this.groupsService.findAll(userId);
    }

    @Post()
    async create(
        @Body() groupData: Omit<Group, 'id' | 'createdAt'> & { invitedUsers?: Array<{ name: string; mobile?: string }> },
    ) {
        return this.groupsService.create(groupData);
    }
}
