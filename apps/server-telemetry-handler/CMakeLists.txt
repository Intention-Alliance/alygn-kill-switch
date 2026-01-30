cmake_minimum_required(VERSION 3.16)
project(sos_telemetry_handler VERSION 1.0.0 LANGUAGES CXX)

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
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG")

# Find required packages
find_package(PkgConfig REQUIRED)

# PostgreSQL (libpqxx)
pkg_check_modules(PQXX REQUIRED libpqxx)

# OpenSSL
find_package(OpenSSL REQUIRED)

# libsodium
pkg_check_modules(SODIUM REQUIRED libsodium)

# Threads
find_package(Threads REQUIRED)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${PQXX_INCLUDE_DIRS}
    ${OPENSSL_INCLUDE_DIR}
    ${SODIUM_INCLUDE_DIRS}
)

# Source files
set(SOURCES
    src/main.cc
)

# Create executable
add_executable(${PROJECT_NAME} ${SOURCES})

# Link libraries
target_link_libraries(${PROJECT_NAME}
    ${PQXX_LIBRARIES}
    ${OPENSSL_LIBRARIES}
    ${SODIUM_LIBRARIES}
    Threads::Threads
    pq
)

# Link directories
target_link_directories(${PROJECT_NAME} PRIVATE
    ${PQXX_LIBRARY_DIRS}
    ${SODIUM_LIBRARY_DIRS}
)

# Install target
install(TARGETS ${PROJECT_NAME}
    RUNTIME DESTINATION bin
)

# CPack for distribution
set(CPACK_PACKAGE_NAME "sos-telemetry-handler")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_DESCRIPTION "SOS-Hook Telemetry Handler for ALYGN Infrastructure")
include(CPack)
