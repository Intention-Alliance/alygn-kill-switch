cmake_minimum_required(VERSION 3.16)
project(rdma_security_monitor VERSION 1.0.0 LANGUAGES CXX)

# Require C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler flags
set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -Wall -Wextra")
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=armv8.2-a+crypto+sve -DNDEBUG")

# Find DOCA SDK
set(DOCA_DIR "/opt/mellanox/doca" CACHE PATH "DOCA SDK installation directory")
set(DPDK_DIR "/opt/mellanox/dpdk" CACHE PATH "DPDK installation directory")

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${DOCA_DIR}/include
    ${DPDK_DIR}/include
)

# Link directories
link_directories(
    ${DOCA_DIR}/lib
    ${DPDK_DIR}/lib
)

# Source files
set(SOURCES
    src/main.cc
)

# Create executable
add_executable(${PROJECT_NAME} ${SOURCES})

# Link libraries
target_link_libraries(${PROJECT_NAME}
    doca_flow
    doca_telemetry
    doca_log
    rte_eal
    rte_mbuf
    rte_ethdev
    rte_meter
    pthread
    numa
    dl
)

# Install target
install(TARGETS ${PROJECT_NAME}
    RUNTIME DESTINATION bin
)

# CPack for distribution
set(CPACK_PACKAGE_NAME "rdma-security-monitor")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_DESCRIPTION "RDMA Security Monitor for NVIDIA BlueField-3 DPU")
include(CPack)
