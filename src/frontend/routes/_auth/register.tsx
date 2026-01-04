import { createFileRoute, Link } from '@tanstack/react-router'
import { auth } from '@frontend/auth'
import { useMutation } from '@tanstack/react-query'
import { Button } from "@frontend/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@frontend/components/ui/card"
import {
	Field,
	FieldDescription,
	FieldGroup,
} from "@frontend/components/ui/field"
import { useAppForm } from '@frontend/components/ui/form'

export const Route = createFileRoute('/_auth/register')({
	component: RouteComponent,
})

function RouteComponent() {
	const mutation = useMutation({
		mutationFn: async ({ name, email, password }: { name: string; email: string, password: string }) => {
			const result = await auth.signUp.email({ name, email, password })

			if (result.error) {
				throw result.error?.message
			}

			return result.data
		},
	})

	const form = useAppForm({
		defaultValues: {
			name: '',
			email: '',
			password: '',
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync({
				name: value.name,
				email: value.email,
				password: value.password,
			});
		},
	})

	return (
		<div className='grid place-items-center min-h-dvh'>
			<div className="flex flex-col gap-6 w-sm max-w-dvw">
				<Card>
					<CardHeader>
						<CardTitle>Sign up for an account</CardTitle>
						<CardDescription>
							Enter your details below to create your account
						</CardDescription>
					</CardHeader>
					<CardContent>
						{mutation.error && <div>{mutation.error.message}</div>}
						<form onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}>
							<FieldGroup>
								<form.AppField
									name="name"
									children={(field) => (
										<Field>
											<field.Label>Name</field.Label>
											<field.Input placeholder="John Doe" required />
											<field.Errors />
										</Field>
									)}
								/>
								<form.AppField
									name="email"
									children={(field) => (
										<Field>
											<field.Label>Email</field.Label>
											<field.Input type="email" placeholder="m@example.com" required />
											<field.Errors />
										</Field>
									)}
								/>
								<form.AppField
									name="password"
									children={(field) => (
										<Field>
											<field.Label>Password</field.Label>
											<field.Password required />
											<field.Errors />
										</Field>
									)}
								/>
								<Field>
									<form.Subscribe
										selector={(state) => [state.canSubmit, state.isSubmitting]}
										children={([canSubmit, isSubmitting]) => (
											<Button
												type="submit"
												disabled={!canSubmit}
											>
												{isSubmitting ? 'Registering...' : 'Register'}
											</Button>
										)}
									/>
									<FieldDescription className="text-center">
										Already have an account? <Link to="/login">Log in</Link>
									</FieldDescription>
								</Field>
							</FieldGroup>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
