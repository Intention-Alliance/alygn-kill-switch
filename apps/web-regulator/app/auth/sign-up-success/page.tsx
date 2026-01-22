import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import Link from "next/link";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Thank you for signing up!
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                You&apos;ve successfully signed up! Please check your email to
                confirm your account... though for now, it is fine.{" "}
                <Link
                  href="/"
                  className="transition-all inline-flex underline underline-offset-1 hover:underline-offset-4 items-center justify-center px-0.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Go to dashboard
                </Link>{" "}
                to get started ;)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
