#!/bin/bash
set -e

echo "=== Starting Local AI Environment Setup (Ubuntu & Fedora) ==="

# 1. Detect Package Manager and Install System Dependencies
if command -v dnf &> /dev/null; then
    echo "[+] Detected Fedora / RHEL-based system."
    echo "[+] Installing build tools and Vulkan dependencies via DNF..."
    sudo dnf install -y git cmake gcc-c++ make glslc glslang vulkan-headers vulkan-loader-devel python3-pip python3-devel
elif command -v apt &> /dev/null; then
    echo "[+] Detected Ubuntu / Debian-based system."
    echo "[+] Installing build tools and Vulkan dependencies via APT..."
    sudo apt update
    sudo apt install -y git cmake build-essential libvulkan-dev glslc spirv-headers python3-pip python3-dev
else
    echo "[-] Error: Unsupported distribution. Please install CMake, Git, and Vulkan headers manually."
    exit 1
fi

# 2. Clone & Build stable-diffusion.cpp with Vulkan
echo "[+] Cloning stable-diffusion.cpp repository..."
if [ ! -d "stable-diffusion.cpp" ]; then
    git clone --recursive https://github.com/leejet/stable-diffusion.cpp.git
fi

echo "[+] Compiling stable-diffusion.cpp with Vulkan support..."
cd stable-diffusion.cpp
mkdir -p build
cd build
cmake .. -DSD_VULKAN=ON
cmake --build . --config Release -j$(nproc)
cd ../..
echo "[+] stable-diffusion.cpp built successfully!"

# 3. Set up Python Environment & Utilities (Rembg, HF Hub)
echo "[+] Setting up Python virtual environment..."
python3 -m venv qwen-img2img-env
source qwen-img2img-env/bin/activate

echo "[+] Upgrading pip and installing background removal + huggingface tools..."
pip install --upgrade pip setuptools wheel
pip install rembg[cpu] huggingface_hub

echo "=== Setup Complete! ==="
echo "To activate your Python environment later, run:"
echo "  source qwen-img2img-env/bin/activate"