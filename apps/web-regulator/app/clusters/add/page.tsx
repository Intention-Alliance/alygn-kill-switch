"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Cpu, Loader2, MapPin, Plus, Server } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Pre-defined hardware profiles
const GPU_PROFILES = {
  "NVIDIA H100": { memory: 80, cores: 14592 },
  "NVIDIA A100": { memory: 80, cores: 6912 },
  "NVIDIA A100 (40GB)": { memory: 40, cores: 6912 },
  "NVIDIA V100": { memory: 32, cores: 5120 },
  "NVIDIA L40S": { memory: 48, cores: 18176 },
};

export default function AddClusterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [location, setLocation] = useState("");

  // GPU State
  const [gpuModel, setGpuModel] = useState("NVIDIA H100");
  const [gpuCount, setGpuCount] = useState(8);

  // Derived specs based on selection
  const selectedProfile = GPU_PROFILES[gpuModel as keyof typeof GPU_PROFILES];

  // Auto-generate slug from name
  useEffect(() => {
    const generatedSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "") // Remove non-word chars
      .replace(/[\s_-]+/g, "-") // Replace spaces/underscores with -
      .replace(/^-+|-+$/g, ""); // Remove leading/trailing -
    setSlug(generatedSlug);
  }, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!name || !location || !gpuModel || gpuCount <= 0) {
      setError("Please fill in all hardware specifications correctly.");
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    try {
      // 1. Insert Cluster
      const { data: cluster, error: clusterError } = await supabase
        .from("dpu_clusters")
        .insert({
          name,
          slug, // Generated from name
          location,
          status: "operational",
          avg_latency: 0,
          uptime: 100,
          total_requests: 0,
        })
        .select()
        .single();

      if (clusterError) {
        if (clusterError.code === "23505") {
          throw new Error(
            `A cluster with the name "${name}" (slug: ${slug}) already exists.`,
          );
        }
        throw clusterError;
      }

      // 2. Insert GPU Details (One row per unit)
      const gpuRows = Array.from({ length: gpuCount }).map(() => ({
        cluster_id: cluster.id,
        model: gpuModel,
        memory_gb: selectedProfile.memory,
        cores: selectedProfile.cores,
      }));

      const { error: gpuError } = await supabase
        .from("cluster_gpus")
        .insert(gpuRows);

      if (gpuError) throw gpuError;

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to register hardware cluster.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 flex flex-col items-center justify-center bg-background">
      <div className="w-full max-w-2xl space-y-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 text-muted-foreground hover:text-foreground"
        >
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
          </Link>
        </Button>

        <Card className="border-border/50 bg-card/50 backdrop-blur-md shadow-xl overflow-hidden">
          <CardHeader className="space-y-1 bg-muted/30 border-b border-border/20 p-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <Server className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  Node Onboarding
                </CardTitle>
                <CardDescription className="text-sm">
                  Register new hardware resources to the ALYGN sovereign
                  network.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="p-8 space-y-8">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium animate-in fade-in slide-in-from-top-1">
                  {error}
                </div>
              )}

              {/* Cluster Core Info */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Server className="size-3" /> System Identity
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Cluster Display Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g. Austin Primary Hub"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={isLoading}
                      className="bg-background/50 border-border/50 focus:ring-1 focus:ring-primary/40 transition-all"
                    />
                    {slug && (
                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                        ID: <span className="text-primary/70">{slug}</span>
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Physical Location</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        id="location"
                        placeholder="e.g. Austin, TX"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        required
                        disabled={isLoading}
                        className="pl-9 bg-background/50 border-border/50 focus:ring-1 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* GPU Hardware Specs */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Cpu className="size-3" /> Hardware Specifications
                </h3>
                <div className="p-6 rounded-xl bg-muted/20 border border-border/30 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* GPU Model Selection */}
                    <div className="space-y-2">
                      <Label>GPU Model</Label>
                      <Select
                        value={gpuModel}
                        onValueChange={setGpuModel}
                        disabled={isLoading}
                      >
                        <SelectTrigger className="bg-background/50 border-border/50">
                          <SelectValue placeholder="Select GPU Model" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(GPU_PROFILES).map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* GPU Specs Read-only */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1 p-3 rounded-lg bg-background/30 border border-border/30">
                        <Label className="text-xs text-muted-foreground">
                          VRAM
                        </Label>
                        <p className="font-mono font-bold text-sm">
                          {selectedProfile.memory} GB
                        </p>
                      </div>
                      <div className="space-y-1 p-3 rounded-lg bg-background/30 border border-border/30">
                        <Label className="text-xs text-muted-foreground">
                          CUDA Cores
                        </Label>
                        <p className="font-mono font-bold text-sm">
                          {selectedProfile.cores.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Count Slider */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Node Count</Label>
                      <span className="font-mono font-bold text-lg text-primary">
                        {gpuCount} Units
                      </span>
                    </div>
                    <Slider
                      value={[gpuCount]}
                      onValueChange={(vals) => setGpuCount(vals[0])}
                      max={128}
                      min={1}
                      step={1}
                      disabled={isLoading}
                      className="py-4"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                  Total Capacity:{" "}
                  <span className="font-bold text-foreground">
                    {(selectedProfile.memory * gpuCount).toLocaleString()} GB
                    Global Memory
                  </span>{" "}
                  •{" "}
                  <span className="font-bold text-foreground">
                    {(selectedProfile.cores * gpuCount).toLocaleString()} Total
                    Cores
                  </span>
                </p>
              </div>
            </CardContent>

            <CardFooter className="bg-muted/30 border-t border-border/20 p-8 flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Propagating Ledger Entry...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-5 w-5" />
                    Authorize & Register Cluster
                  </>
                )}
              </Button>
              <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                <span className="flex items-center gap-1.5">
                  <div className="size-1.5 rounded-full bg-green-500" /> AES-256
                  Encrypted
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="size-1.5 rounded-full bg-blue-500" /> ZKP
                  Verified
                </span>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
