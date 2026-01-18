import axios from 'axios';

const client = axios.create({
    baseURL: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8500/api' : '/api'),
});

export default client;
