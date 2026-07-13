import axios from 'axios';

// Em desenvolvimento usa o proxy do Vite (/api). Em produção, defina
// VITE_API_URL com a URL pública do backend (ex: https://api.seudominio.com.br/api)
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('zebrazul_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('zebrazul_token');
      localStorage.removeItem('zebrazul_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
