export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  settledAt: string;
  createdAt: string;
  createdBy: string;
  groupId?: string;
  note?: string;
}
