export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  mobile?: string;
}

export interface InviteUserDto {
  name: string;
  mobile?: string;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  mobile?: string;
  avatar?: string;
  password?: string;
}
