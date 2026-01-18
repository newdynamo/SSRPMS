import client from './client';
import type { Report } from '../types/index';

export const fetchReports = async (): Promise<Report[]> => {
    try {
        const response = await client.get<Report[]>('/reports');
        return response.data;
    } catch (err) {
        console.error("Failed to fetch reports", err);
        return [];
    }
};

export const submitReport = async (report: Report): Promise<void> => {
    await client.post('/reports', report);
};

export const deleteReport = async (id: string): Promise<void> => {
    await client.delete(`/reports/${id}`);
};

export const updateReport = async (id: string, report: Partial<Report>): Promise<void> => {
    await client.put(`/reports/${id}`, report);
};
