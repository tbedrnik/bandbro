import { auth } from "@frontend/auth";
import { Button } from "@frontend/components/ui/button";
import { useUser } from "@frontend/contexts/UserContext";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/")({
	component: RouteComponent,
});

function RouteComponent() {
	const user = useUser();
	return (
		<div className="flex flex-col gap-4">
			<div>Hello {user.name}</div>
			<div>
				<Button onClick={() => auth.signOut()}>Logout</Button>
			</div>
		</div>
	);
}
