import { useSession } from '@frontend/contexts/SessionContext'
import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected')({
	component: () => {
		const session = useSession({ optional: true })

		if (!session) {
			return <Navigate to="/login" />
		}

		return <Outlet />
	}
})
