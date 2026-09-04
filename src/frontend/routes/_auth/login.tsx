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

export const Route = createFileRoute("/_auth/login")({
	component: RouteComponent,
});

function RouteComponent() {
	const { redirect } = Route.useSearch();
	const mutation = useMutation({
		mutationKey: ["auth", "signIn", "email"],
		mutationFn: async (opts: Parameters<typeof auth.signIn.email>[0]) =>
			auth.signIn.email(opts),
	});

	const form = useAppForm({
		defaultValues: {
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync({
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
						<CardTitle>Login to your account</CardTitle>
						<CardDescription>
							Enter your email below to login to your account
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
								<form.AppField name="email">
									{(field) => (
										<Field>
											<field.Label>Email</field.Label>
											<field.Input type="email" placeholder="m@example.com" />
											<field.Errors />
										</Field>
									)}
								</form.AppField>
								<form.AppField name="password">
									{(field) => (
										<Field>
											<div className="flex items-center">
												<field.Label>Password</field.Label>
												<a
													href="#"
													className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
												>
													Forgot your password?
												</a>
											</div>
											<field.Password />
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
												{isSubmitting ? "Logging in..." : "Login"}
											</Button>
										)}
									</form.Subscribe>
									<FieldDescription className="text-center">
										Don&apos;t have an account?{" "}
										<Link to="/register" search={{ redirect }}>
											Sign up
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
