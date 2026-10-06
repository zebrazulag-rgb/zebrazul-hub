import axios from 'axios';
import { getTenantSlug } from './tenant';
import { resolveMediaTree } from './utils/mediaUrl';

// Em desenvolvimento usa o proxy do Vite (/api). Em produção, defina
// VITE_API_URL com a URL pública do backend (ex: https://api.seudominio.com.br/api)
const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('zebrazul_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Tenant-Slug'] = getTenantSlug();
  return config;
});

api.interceptors.response.use(
  (res) => {
    res.data = resolveMediaTree(res.data);
    return res;
  },
  (err) => {
    // [FASE 1] Só trata como "sessão expirada" quando existia uma sessão e a falha NÃO veio
    // do próprio login. Antes, senha errada recarregava a tela e apagava a mensagem de erro,
    // e páginas públicas (links de aprovação) podiam ser jogadas para /login.
    const status = err.response?.status;
    const requestUrl = String(err.config?.url || '');
    const isLoginRequest = requestUrl.includes('/auth/login');
    const hadSession = Boolean(localStorage.getItem('zebrazul_token'));

    if (status === 401 && hadSession && !isLoginRequest) {
      localStorage.removeItem('zebrazul_token');
      localStorage.removeItem('zebrazul_user');
      if (window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1');
      }
    }
    return Promise.reject(err);
  }
);

export default api;
