import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Param,
    NotFoundException,
    Patch,
    BadRequestException,
} from '@nestjs/common';
import { UsersService, User } from './users.service';

@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Get()
    async findAll(@Query() query: Partial<User>) {
        return this.usersService.findByQuery(query);
    }

    @Post()
    async create(@Body() user: Omit<User, 'id'>) {
        return this.usersService.create(user);
    }

    @Post('invite')
    async inviteUser(@Body() userData: { name: string; mobile?: string }) {
        return this.usersService.createInvitedUser(userData);
    }

    @Post(':id/push-token')
    async updatePushToken(@Param('id') id: string, @Body('pushToken') pushToken: string) {
        const user = await this.usersService.updatePushToken(id, pushToken);
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        return user;
    }

    @Patch(':id')
    async updateUser(@Param('id') id: string, @Body() updates: Partial<Omit<User, 'id'>>) {
        try {
            const user = await this.usersService.updateUser(id, updates);
            if (!user) {
                throw new NotFoundException(`User with ID ${id} not found`);
            }
            return user;
        } catch (error: any) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(error?.message || 'Failed to update user');
        }
    }
}
