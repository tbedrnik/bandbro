import { RouterProvider } from '@tanstack/react-router';
import React from 'react'
import ReactDOM from 'react-dom/client';
import { routeTree } from '../generated/tanstack-router/routeTree.gen';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';

const queryClient = new QueryClient();

const router = createRouter({
	basepath: '/app', // matches with basepath in backend
	routeTree,
	scrollRestoration: true,
	defaultPreload: 'intent',
	defaultPendingComponent: () => "loading...",
	context: { queryClient }
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}

	interface HistoryState { }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</React.StrictMode>,
)