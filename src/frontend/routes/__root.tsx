import { auth } from '@frontend/auth'
import { SessionProvider } from '@frontend/contexts/SessionContext'
import { UserProvider } from '@frontend/contexts/UserContext'
import { useStore } from '@nanostores/react'
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
	notFoundComponent: () => <div>404 Not Found</div>,
	component: () => {
		const { data, error, isPending } = useStore(auth.useSession)

		if (isPending) {
			return <div>Loading...</div>
		}

		if (error) {
			throw error
		}

		return (
			<SessionProvider value={data?.session ?? null}>
				<UserProvider value={data?.user ?? null}>
					<Outlet />
				</UserProvider>
			</SessionProvider>
		)
	}
})
