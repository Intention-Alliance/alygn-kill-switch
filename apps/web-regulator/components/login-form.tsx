"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { Fingerprint } from "lucide-react";
import { SecurityKeySignInButton } from "@/components/security/security-key-signin-button";

export function LoginForm({
	className,
	...props
}: React.ComponentPropsWithoutRef<"div">) {
	return (
		<Suspense fallback={null}>
			<LoginFormInner className={className} {...props} />
		</Suspense>
	);
}

function LoginFormInner({
	className,
	...props
}: React.ComponentPropsWithoutRef<"div">) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const { login, isAuthenticated } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const webauthnRegistered = searchParams.get("webauthn") === "registered";

	// Resolve where to send the user after a successful sign-in. Honour an
	// explicit ?callbackUrl (set by the dashboard AuthGuard when it bounced an
	// unauthenticated visitor off a protected route) but only for same-origin,
	// internal paths — never an external URL (open-redirect guard).
	const getCallbackUrl = () => {
		const raw = searchParams.get("callbackUrl");
		if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
			return raw;
		}
		return "/";
	};

	// Redirect if already authenticated
	useEffect(() => {
		if (isAuthenticated) router.push(getCallbackUrl());
	}, [isAuthenticated, router]);

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			await login(email, password);
			router.push(getCallbackUrl());
		} catch (error: unknown) {
			setError(error instanceof Error ? error.message : "Login failed");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">Login</CardTitle>
					<CardDescription>
						Enter your email below to login to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					{webauthnRegistered && (
						<div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
							<Fingerprint className="h-4 w-4 shrink-0" aria-hidden="true" />
							<span>Welcome. Touch your security key to sign in.</span>
						</div>
					)}
					<form onSubmit={handleLogin}>
						<div className="flex flex-col gap-6">
							<div className="grid gap-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									placeholder="m@example.com"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
							</div>
							<div className="grid gap-2">
								<div className="flex items-center">
									<Label htmlFor="password">Password</Label>
									<Link
										href="/auth/forgot-password"
										className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
									>
										Forgot your password?
									</Link>
								</div>
								<Input
									id="password"
									type="password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
							</div>
							{error && <p className="text-sm text-red-500" role="alert">{error}</p>}
							<Button type="submit" className="w-full" disabled={isLoading}>
								{isLoading ? "Logging in..." : "Login"}
							</Button>
						</div>
						<div className="my-4 flex items-center gap-3">
							<div className="h-px flex-1 bg-border" />
							<span className="text-xs text-muted-foreground">or</span>
							<div className="h-px flex-1 bg-border" />
						</div>
						<SecurityKeySignInButton redirectTo={getCallbackUrl()} />
						<div className="mt-4 text-center text-sm">
							Don&apos;t have an account?{" "}
							<Link
								href="/auth/sign-up"
								className="underline underline-offset-4"
							>
								Sign up
							</Link>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
