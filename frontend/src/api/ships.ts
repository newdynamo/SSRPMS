import client from './client';
import type { Ship } from '../types/index';

export const fetchShips = async (): Promise<Ship[]> => {
    const response = await client.get<Ship[]>('/ships');
    return response.data;
};

export const saveShips = async (ships: Ship[]): Promise<void> => {
    await client.post('/ships', ships);
};
