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

    private sanitizeUser(user: User) {
        const { password, passwordHash, ...safeUser } = user as User & { passwordHash?: string };
        return safeUser;
    }

    @Get()
    async findAll(@Query() query: Partial<User>) {
        const users = await this.usersService.findByQuery(query);
        return users.map((user) => this.sanitizeUser(user));
    }

    @Post()
    async create(@Body() user: Omit<User, 'id'>) {
        const createdUser = await this.usersService.create(user);
        return this.sanitizeUser(createdUser);
    }

    @Post('invite')
    async inviteUser(@Body() userData: { name: string; mobile?: string }) {
        const invitedUser = await this.usersService.createInvitedUser(userData);
        return this.sanitizeUser(invitedUser);
    }

    @Post(':id/push-token')
    async updatePushToken(@Param('id') id: string, @Body('pushToken') pushToken: string) {
        const user = await this.usersService.updatePushToken(id, pushToken);
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        return this.sanitizeUser(user);
    }

    @Patch(':id')
    async updateUser(@Param('id') id: string, @Body() updates: Partial<Omit<User, 'id'>>) {
        try {
            const user = await this.usersService.updateUser(id, updates);
            if (!user) {
                throw new NotFoundException(`User with ID ${id} not found`);
            }
            return this.sanitizeUser(user);
        } catch (error: any) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new BadRequestException(error?.message || 'Failed to update user');
        }
    }
}
