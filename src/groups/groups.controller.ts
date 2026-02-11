import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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

    @Patch(':id')
    async update(
        @Param('id') id: string,
        @Body() groupData: Partial<Pick<Group, 'name' | 'members'>> & { invitedUsers?: Array<{ name: string; mobile?: string }> },
        @Query('userId') userId?: string,
    ) {
        return this.groupsService.update(id, groupData, userId);
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @Query('userId') userId?: string) {
        return this.groupsService.remove(id, userId);
    }
}
