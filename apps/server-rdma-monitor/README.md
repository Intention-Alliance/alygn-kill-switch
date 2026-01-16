# RDMA Security Monitor for BlueField-3 DPU

Hardware-level RDMA packet inspection and AI Safety enforcement for the ALIGN Sovereign Compliance Infrastructure.

## Features

- **RDMA OpCode Classification**: Identifies Read/Write operations via BTH parsing
- **Malformed Packet Detection**: 1ms time window heuristic with configurable thresholds
- **Memory Intent Manifest Validation**: Ensures RDMA operations stay within approved boundaries
- **Grid Threat Detection**: 380 Gbps throughput metering with 500μs window
- **Hardware Kill-Switch**: ~3.4ms flow severance via DOCA Flow API

## Target Hardware

- **DPU**: NVIDIA BlueField-3 (BF3)
- **SDK**: NVIDIA DOCA 2.5+
- **Network**: RoCEv2 (RDMA over Converged Ethernet)

## Build

### Prerequisites

The build requires NVIDIA DOCA SDK and DPDK, which are pre-installed on BlueField-3 DPUs.

### Cross-Compilation (from x86 host)

```bash
# Using Docker with DOCA base image
docker build -f Dockerfile.dpu -t rdma-security-monitor .

# Extract binary
docker create --name temp rdma-security-monitor
docker cp temp:/usr/local/bin/rdma_security_monitor ./
docker rm temp
```

### Native Build (on DPU)

```bash
# SSH to DPU
ssh ubuntu@bf3-dpu

# Build
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)
```

## Deployment

### Flash to DPU

```bash
# Copy binary to DPU
scp rdma_security_monitor ubuntu@bf3-dpu:/opt/security/

# SSH to DPU and run
ssh ubuntu@bf3-dpu
cd /opt/security
./rdma_security_monitor -a 03:00.0 -a 03:00.1 --log-level=doca_flow:8
```

### EAL Parameters

| Parameter | Description |
|-----------|-------------|
| `-a 03:00.0` | First PCI device (network port) |
| `-a 03:00.1` | Second PCI device (network port) |
| `--log-level=doca_flow:8` | Enable debug logging |

## Security Thresholds

| Threshold | Value | Description |
|-----------|-------|-------------|
| `MALFORMED_THRESHOLD` | 10 | Max malformed packets in window |
| `DETECTION_WINDOW_US` | 1000 | Detection window (1ms) |
| `GRID_THREAT_GBPS` | 380 | Throughput threshold |
| `GRID_THREAT_WINDOW_US` | 500 | Rate check window (500μs) |

## Intent Manifest

Register memory boundaries for AI agents:

```cpp
monitor.register_intent_manifest(
    0,                      // agent_id
    0x7f0000000000ULL,     // base_addr
    256 * 1024 * 1024,     // size (256MB)
    true                    // is_gpu_memory
);
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  BlueField-3 DPU                        │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │ DOCA Flow   │ → │ BTH Parser  │ → │ OpCode      │   │
│  │ (HW accel)  │   │ (offset 42) │   │ Classifier  │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   │
│         ↓                 ↓                 ↓          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Security Checks                     │   │
│  │  • Malformed detection (10 pkts/1ms)            │   │
│  │  • Intent Manifest validation                    │   │
│  │  • Grid Threat metering (380Gbps)               │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                             │
│            DOCA_FLOW_FWD_DROP (kill-switch)            │
└─────────────────────────────────────────────────────────┘
```

## Telemetry Output

Events are sent to the SOS-Hook Telemetry Handler:

```json
{
  "timestamp": 1703783421123456,
  "qp_num": 12345,
  "remote_addr": "0x7f0000050000",
  "length": 4096,
  "violation": true,
  "action": "FLOW_SEVERED",
  "reason": "MANIFEST_VIOLATION"
}
```

## References

- [NVIDIA DOCA SDK Documentation](https://docs.nvidia.com/doca/)
- [BlueField-3 Datasheet](https://www.nvidia.com/en-us/networking/products/data-processing-unit/)
- [RDMA Specification (IBA)](https://www.infinibandta.org/ibta-specification/)
