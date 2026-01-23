import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const nextConfig: NextConfig = {
	serverExternalPackages: ["@packages/lib"],
	images: {
		remotePatterns: [
			{
				protocol: isProduction ? "https" : "http",
				hostname:
					new URL(process.env?.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1")
						.hostname || "127.0.0.1",
				port: process.env.NEXT_PUBLIC_SUPABASE_PORT || "54321",
				pathname: "/storage/v1/object/public/**",
			},
		],
	},
	cacheComponents: true,
};

export default nextConfig;
