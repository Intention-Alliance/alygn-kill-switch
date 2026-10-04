import { Activity, Check, Key } from 'lucide-react'
import { AdminGuard } from '@/components/admin-guard'
import { ApiKeysPageClient } from '@/components/api-keys/api-keys-page'
import { Badge } from '@/components/ui/badge'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { requireAdmin } from '@/lib/server-auth'
import type { ApiKeysPageData } from '@/types/api-keys'
import { fetchApiKeys } from './actions'

export const metadata = {
	title: 'API Keys | AdminUI',
}

/**
 * Webhook API Keys — admin page (Card 0e2f9fec / spec §7).
 *
 * List + generate + rotate + revoke + audit panel.
 * Server-side render: fetches initial keys + recent audit via the
 * server actions (which call the kill-switch-api with ADMIN_UI_API_KEY).
 */
export default async function ApiKeysPage() {
	// Enforce the admin role server-side BEFORE fetching sensitive data, so a
	// non-admin authenticated user never receives the RSC payload containing
	// API keys + audit logs (Nikaya P1 finding).
	await requireAdmin('/admin/api-keys')

	let initial: ApiKeysPageData
	try {
		initial = await fetchApiKeys()
	} catch {
		initial = { keys: [], audit: [] }
	}

	return (
		<AdminGuard>
			<div className="space-y-4">
				<PageHeader keyCount={initial.keys.length} />
				<ApiKeysPageClient initial={initial} />
			</div>
		</AdminGuard>
	)
}

function IdentityPill() {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="flex items-center gap-1.5 rounded-full border bg-card px-2 py-1 text-xs text-card-foreground">
					<Check className="h-3 w-3 text-success" aria-hidden="true" />
					<span className="font-mono">andler@regulator</span>
				</div>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<p className="text-xs">Operator identity verified</p>
			</TooltipContent>
		</Tooltip>
	)
}

function PageHeader({ keyCount }: { keyCount: number }) {
	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
			<div className="flex items-center gap-2">
				<Key className="h-4 w-4 text-primary" aria-hidden="true" />
				<h1 className="text-xl font-semibold tracking-tight">
					Webhook API Keys
				</h1>
				<Badge variant="secondary">{keyCount} keys</Badge>
			</div>

			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Activity className="h-3 w-3" aria-hidden="true" />
				<span>openclaw-webhook gateway</span>
			</div>

			<div className="flex items-center justify-end">
				<IdentityPill />
			</div>
		</div>
	)
}
