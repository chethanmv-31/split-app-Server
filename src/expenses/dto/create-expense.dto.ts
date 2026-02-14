export interface SplitDetailDto {
  userId: string;
  amount: number;
}

export interface InvitedUserDto {
  name: string;
  mobile?: string;
}

export interface CreateExpenseDto {
  title: string;
  amount: number;
  date: string;
  category: string;
  groupId?: string;
  splitType: 'EQUAL' | 'UNEQUAL';
  splitBetween: string[];
  splitDetails?: SplitDetailDto[];
  invitedUsers?: InvitedUserDto[];
}
