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

export const Route = createFileRoute('/_auth/login')({
	component: RouteComponent,
})

function RouteComponent() {
	const mutation = useMutation({
		mutationFn: async (opts: Parameters<typeof auth.signIn.email>[0]) => {
			const result = await auth.signIn.email(opts)

			if (result.error) {
				throw result.error?.message
			}

			return result.data
		}
	})

	const form = useAppForm({
		defaultValues: {
			email: '',
			password: '',
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync({
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
						<CardTitle>Login to your account</CardTitle>
						<CardDescription>
							Enter your email below to login to your account
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
									name="email"
									children={(field) => (
										<Field>
											<field.Label>Email</field.Label>
											<field.Input type="email" placeholder="m@example.com" />
											<field.Errors />
										</Field>
									)}
								/>
								<form.AppField
									name="password"
									children={(field) => (
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
								/>

								<Field>
									<form.Subscribe
										selector={(state) => [state.canSubmit, state.isSubmitting]}
										children={([canSubmit, isSubmitting]) => (
											<Button
												type="submit"
												disabled={!canSubmit}
											>
												{isSubmitting ? 'Logging in...' : 'Login'}
											</Button>
										)}
									/>
									<FieldDescription className="text-center">
										Don&apos;t have an account? <Link to="/register">Sign up</Link>
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
