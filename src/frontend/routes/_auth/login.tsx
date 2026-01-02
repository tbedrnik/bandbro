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
	FieldLabel,
} from "@frontend/components/ui/field"
import { Input } from "@frontend/components/ui/input"

export const Route = createFileRoute('/_auth/login')({
	component: RouteComponent,
})

function RouteComponent() {
	const mutation = useMutation({
		mutationFn: ({ email, password }: { email: string, password: string }) => auth.signIn.email({ email, password, fetchOptions: { throw: true } }),
	})

	const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		mutation.mutate({ email: e.currentTarget.email.value, password: e.currentTarget.password.value })
	}
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
						<form onSubmit={onSubmit}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="email">Email</FieldLabel>
									<Input
										id="email"
										type="email"
										name="email"
										placeholder="m@example.com"
										required
									/>
								</Field>
								<Field>
									<div className="flex items-center">
										<FieldLabel htmlFor="password">Password</FieldLabel>
										<a
											href="#"
											className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
										>
											Forgot your password?
										</a>
									</div>
									<Input id="password" type="password" name="password" required />
								</Field>
								<Field>
									<Button type="submit" disabled={mutation.isPending}>Login</Button>
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
