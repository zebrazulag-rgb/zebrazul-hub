import { createContext, useContext, useState, useEffect } from 'react';

const ClientFilterContext = createContext(null);

export function ClientFilterProvider({ children }) {
  const [selectedClient, setSelectedClientState] = useState(() => {
    const raw = localStorage.getItem('zebrazul_selected_client');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (selectedClient) {
      localStorage.setItem('zebrazul_selected_client', JSON.stringify(selectedClient));
    } else {
      localStorage.removeItem('zebrazul_selected_client');
    }
  }, [selectedClient]);

  return (
    <ClientFilterContext.Provider value={{ selectedClient, setSelectedClient: setSelectedClientState }}>
      {children}
    </ClientFilterContext.Provider>
  );
}

export function useClientFilter() {
  return useContext(ClientFilterContext);
}
