import client from './client';
import type { Port } from '../types';

export const fetchPorts = async (): Promise<Port[]> => {
    try {
        const response = await client.get<Port[]>('/ports');
        return response.data;
    } catch (err) {
        console.error("Failed to fetch ports", err);
        return [];
    }
};

export const savePorts = async (ports: Port[]): Promise<void> => {
    await client.post('/ports', ports);
};
