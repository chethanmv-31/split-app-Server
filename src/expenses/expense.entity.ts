export interface SplitDetail {
    userId: string;
    amount: number;
}

export interface Expense {
    id: string;
    title: string;
    amount: number;
    date: string;
    category: string;
    paidBy: string; // User ID
    splitType: 'EQUAL' | 'UNEQUAL';
    splitBetween: string[]; // Array of User IDs
    splitDetails?: SplitDetail[];
}
