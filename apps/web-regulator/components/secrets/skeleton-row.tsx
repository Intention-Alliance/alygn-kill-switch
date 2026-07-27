import { Skeleton } from "@/components/ui/skeleton";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";

export function SkeletonRow({ delay }: { delay?: "75" | "150" }) {
  return (
    <TableRow className="h-8">
      <TableCell className="w-[280px]">
        <Skeleton
          className={cnSkeleton("h-3 w-48", delay)}
          data-testid="skeleton-name"
        />
      </TableCell>
      <TableCell className="w-[200px]">
        <Skeleton className={cnSkeleton("h-3 w-28", delay)} />
      </TableCell>
      <TableCell className="w-[120px]">
        <Skeleton className={cnSkeleton("h-3 w-20", delay)} />
      </TableCell>
      <TableCell className="w-[140px]">
        <Skeleton className={cnSkeleton("h-3 w-24", delay)} />
      </TableCell>
      <TableCell className="w-[100px]">
        <Skeleton className={cnSkeleton("h-6 w-16", delay)} />
      </TableCell>
    </TableRow>
  );
}

function cnSkeleton(base: string, delay?: "75" | "150") {
  if (!delay) return base;
  return `${base} motion-safe:animate-pulse motion-safe:delay-${delay}`;
}
