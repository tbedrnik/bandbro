import { auth } from "@frontend/auth";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@frontend/components/ui/alert";
import { Button } from "@frontend/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@frontend/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
} from "@frontend/components/ui/field";
import { useAppForm } from "@frontend/components/ui/form";
import { IconExclamationCircle } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/register")({
	component: RouteComponent,
});

function RouteComponent() {
	const { redirect } = Route.useSearch();
	const mutation = useMutation({
		mutationKey: ["auth", "signUp", "email"],
		mutationFn: async (opts: Parameters<typeof auth.signUp.email>[0]) =>
			auth.signUp.email(opts),
	});

	const form = useAppForm({
		defaultValues: {
			name: "",
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync({
				name: value.name,
				email: value.email,
				password: value.password,
			});
		},
	});

	return (
		<div className="grid place-items-center min-h-dvh">
			<div className="flex flex-col gap-4 w-sm max-w-dvw">
				{mutation.data?.error && (
					<Alert variant="destructive" className="rounded-xl">
						<IconExclamationCircle />
						<AlertTitle>{mutation.data.error.statusText}</AlertTitle>
						<AlertDescription>{mutation.data.error.message}</AlertDescription>
					</Alert>
				)}
				<Card>
					<CardHeader>
						<CardTitle>Sign up for an account</CardTitle>
						<CardDescription>
							Enter your details below to create your account
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<FieldGroup>
								<form.AppField name="name">
									{(field) => (
										<Field>
											<field.Label>Name</field.Label>
											<field.Input placeholder="John Doe" required />
											<field.Errors />
										</Field>
									)}
								</form.AppField>
								<form.AppField name="email">
									{(field) => (
										<Field>
											<field.Label>Email</field.Label>
											<field.Input
												type="email"
												placeholder="m@example.com"
												required
											/>
											<field.Errors />
										</Field>
									)}
								</form.AppField>
								<form.AppField name="password">
									{(field) => (
										<Field>
											<field.Label>Password</field.Label>
											<field.Password required />
											<field.Errors />
										</Field>
									)}
								</form.AppField>
								<Field>
									<form.Subscribe
										selector={(state) => [state.canSubmit, state.isSubmitting]}
									>
										{([canSubmit, isSubmitting]) => (
											<Button type="submit" disabled={!canSubmit}>
												{isSubmitting ? "Registering..." : "Register"}
											</Button>
										)}
									</form.Subscribe>
									<FieldDescription className="text-center">
										Already have an account?{" "}
										<Link to="/login" search={{ redirect }}>
											Log in
										</Link>
									</FieldDescription>
								</Field>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
