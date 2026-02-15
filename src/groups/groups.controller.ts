import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
    constructor(private readonly groupsService: GroupsService) { }

    @Get()
    async findAll(@Req() req: AuthenticatedRequest) {
        return this.groupsService.findAll(req.user.userId);
    }

    @Post()
    async create(
        @Req() req: AuthenticatedRequest,
        @Body() groupData: CreateGroupDto,
    ) {
        return this.groupsService.create(groupData, req.user.userId);
    }

    @Patch(':id')
    async update(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() groupData: UpdateGroupDto,
    ) {
        return this.groupsService.update(id, groupData, req.user.userId);
    }

    @Delete(':id')
    async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.groupsService.remove(id, req.user.userId);
    }
}
