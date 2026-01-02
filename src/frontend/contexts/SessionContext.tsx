import { Auth } from "@frontend/auth";
import { createContext, useContext } from "react";

const SessionContext = createContext<Auth['Session']['session'] | null>(null)

export const SessionProvider = SessionContext.Provider

export const useSession = ({ optional = false }: { optional?: boolean } = {}) => {
	const session = useContext(SessionContext)
	if (!session && !optional) {
		throw new Error('No session found')
	}
	return session
}
