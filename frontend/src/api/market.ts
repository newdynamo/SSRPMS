import client from './client';

export interface MarketHistoryItem {
    date: string;
    value: number;
    change: number;
}

export interface MarketItem {
    id: string;
    title: string;
    currency: string;
    history: MarketHistoryItem[];
}

export const fetchMarketData = async (): Promise<MarketItem[]> => {
    const response = await client.get<MarketItem[]>('/market');
    return response.data;
};
