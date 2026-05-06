"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Cpu, ShieldCheck } from "lucide-react";

interface DPUSecurityBannerProps {
  machineName: string;
  hasDPU: boolean;
}

export function DPUSecurityBanner({
  machineName,
  hasDPU,
}: DPUSecurityBannerProps) {
  if (hasDPU) {
    return (
      <Alert variant="default" className="bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
        <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
        <AlertTitle className="text-green-800 dark:text-green-300">
          DPU Protection Active
        </AlertTitle>
        <AlertDescription className="text-green-700 dark:text-green-400">
          {machineName} has hardware-enforced AI safety compliance via NVIDIA
          BlueField-3 DPU.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      variant="destructive"
      className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-800 dark:text-amber-300">
        No DPU Detected
      </AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-400">
        <strong>{machineName}</strong> is running without hardware-enforced AI
        safety compliance. For maximum protection, consider deploying an NVIDIA
        BlueField-3 DPU to enable:
        <ul className="mt-2 list-disc list-inside text-sm">
          <li>Real-time RDMA packet inspection</li>
          <li>Zero-Knowledge Proof attestations</li>
          <li>Hardware-level redline enforcement</li>
          <li>Cryptoeconomic slashing protection</li>
        </ul>
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
          <Cpu className="h-3 w-3" />
          Learn more about DPU deployment in the{" "}
          <a href="/docs/dpu-setup" className="underline">
            documentation
          </a>
          .
        </p>
      </AlertDescription>
    </Alert>
  );
}
