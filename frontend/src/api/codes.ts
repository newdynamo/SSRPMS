import client from './client';
import type { CodeData, Report, TCode, RCode } from '../types/index';

export const fetchCodes = async (): Promise<CodeData> => {
    const response = await client.get<CodeData>('/codes');
    return response.data;
};

export const saveEVCodes = async (codes: any[]): Promise<void> => {
    await client.post('/ev-codes', codes);
};

export const submitReport = async (report: Report): Promise<void> => {
    await client.post('/reports', report);
};

export const saveTCodes = async (codes: TCode[]): Promise<void> => {
    await client.post('/t-codes', codes);
};

export const saveRCodes = async (codes: RCode[]): Promise<void> => {
    await client.post('/r-codes', codes);
};
