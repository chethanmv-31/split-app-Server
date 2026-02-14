export interface InvitedUserDto {
  name: string;
  mobile?: string;
}

export interface CreateGroupDto {
  name: string;
  members: string[];
  invitedUsers?: InvitedUserDto[];
}

export interface UpdateGroupDto {
  name?: string;
  members?: string[];
  invitedUsers?: InvitedUserDto[];
}
