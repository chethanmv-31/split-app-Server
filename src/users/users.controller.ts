import {
    ForbiddenException,
    Controller,
    Get,
    Post,
    Body,
    Query,
    Param,
    NotFoundException,
    Patch,
    BadRequestException,
    Req,
    UseGuards,
} from '@nestjs/common';
import { UsersService, User } from './users.service';
import { CreateUserDto, FindUsersQueryDto, InviteUserDto, UpdatePushTokenDto, UpdateUserDto } from './dto/user.dto';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
    constructor(private usersService: UsersService) { }

    private sanitizeUser(user: User) {
        const { password, passwordHash, ...safeUser } = user as User & { passwordHash?: string };
        return safeUser;
    }

    @Get()
    @UseGuards(JwtAuthGuard)
    async findAll(@Query() query: FindUsersQueryDto) {
        const users = await this.usersService.findByQuery(query as unknown as Partial<User>);
        return users.map((user) => this.sanitizeUser(user));
    }

    @Post()
    async create(@Body() user: CreateUserDto) {
        const createdUser = await this.usersService.create(user as unknown as Omit<User, 'id'>);
        return this.sanitizeUser(createdUser);
    }

    @Post('invite')
    @UseGuards(JwtAuthGuard)
    async inviteUser(@Body() userData: InviteUserDto) {
        const invitedUser = await this.usersService.createInvitedUser(userData);
        return this.sanitizeUser(invitedUser);
    }

    @Post(':id/push-token')
    @UseGuards(JwtAuthGuard)
    async updatePushToken(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() body: UpdatePushTokenDto,
    ) {
        if (req.user.userId !== id) {
            throw new ForbiddenException('You can only update your own push token');
        }
        const user = await this.usersService.updatePushToken(id, body.pushToken);
        if (!user) {
            throw new NotFoundException(`User with ID ${id} not found`);
        }
        return this.sanitizeUser(user);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    async updateUser(
        @Req() req: AuthenticatedRequest,
        @Param('id') id: string,
        @Body() updates: UpdateUserDto,
    ) {
        if (req.user.userId !== id) {
            throw new ForbiddenException('You can only update your own profile');
        }
        try {
            const user = await this.usersService.updateUser(id, updates as unknown as Partial<Omit<User, 'id'>>);
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
