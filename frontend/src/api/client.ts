import axios from 'axios';

const client = axios.create({
    baseURL: 'http://localhost:8500/api',
});

export default client;
