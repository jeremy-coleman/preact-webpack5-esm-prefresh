import { h } from 'preact';
import { Provider } from '@urql/preact';
import { Router } from 'preact-router';
import AsyncRoute from 'preact-async-route';
import ErrorBoundary from './ErrorBoundary';
import { createClient } from '@urql/preact';

const Loading = () => <p>Loading...</p>

const gqlClient = createClient({
  url: process.env.API_URL || 'http://test.com',
});

export const App = () => (
  <ErrorBoundary>
    <Provider value={gqlClient}>
      <Router>
        <AsyncRoute path="/" getComponent={() => import('./pages/Landing').then(m => m.default)} loading={Loading} />
        <AsyncRoute path="/auth" getComponent={() => import('./pages/Auth').then(m => m.default)} loading={Loading} />
      </Router>
    </Provider>
  </ErrorBoundary>
);