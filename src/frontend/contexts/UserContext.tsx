import { Auth } from "@frontend/auth";
import { createContext, useContext } from "react";

type User = Auth['Session']['user']

const UserContext = createContext<User | null>(null)

export const UserProvider = UserContext.Provider

export function useUser(opts?: { optional?: false }): User
export function useUser(opts?: { optional: true }): User | null
export function useUser(opts?: { optional?: boolean }) {
	const user = useContext(UserContext)

	if (opts?.optional === true) {
		return user
	}

	if (!user) {
		throw new Error('No user found')
	}

	return user
}
