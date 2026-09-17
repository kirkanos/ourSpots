import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { startOutboxSync } from './offline/outbox';
import { UnauthorizedError } from './api/client';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Eine abgelaufene Sitzung wird nicht durch Wiederholen besser; der
      // RequireAuth-Wrapper zeigt dann den Login-Hinweis.
      retry: (failureCount, error) => !(error instanceof UnauthorizedError) && failureCount < 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Wurzelelement #root fehlt im HTML');

// Warteschlange sofort abarbeiten und auf Verbindungswechsel horchen.
startOutboxSync();

// Ein Update wird beim nächsten Laden übernommen; ein Neustart mitten in der
// Erfassung wäre schlimmer als eine kurz veraltete Fassung.
registerSW({ immediate: false });

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
