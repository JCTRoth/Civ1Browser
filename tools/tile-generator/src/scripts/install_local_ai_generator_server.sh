#!/bin/bash
set -e

# Define root directory (assuming script is run from project root)
PROJECT_ROOT=$(pwd)
MODELS_DIR="$PROJECT_ROOT/tools/tile-generator/models"

echo "=== 1. Installing System Dependencies ==="
if command -v dnf &> /dev/null; then
    echo "[+] Detected Fedora system. Installing via DNF..."
    sudo dnf install -y git cmake gcc-c++ make glslc glslang vulkan-headers vulkan-loader-devel python3-pip python3-devel
elif command -v apt &> /dev/null; then
    echo "[+] Detected Ubuntu/Debian system. Installing via APT..."
    sudo apt update
    sudo apt install -y git cmake build-essential libvulkan-dev glslc spirv-headers python3-pip python3-dev
else
    echo "[-] Unsupported package manager. Please install CMake and Vulkan manually."
    exit 1
fi

echo "=== 2. Building stable-diffusion.cpp with Vulkan ==="
if [ ! -d "stable-diffusion.cpp" ]; then
    echo "[+] Cloning stable-diffusion.cpp..."
    git clone --recursive https://github.com/leejet/stable-diffusion.cpp.git
fi
cd stable-diffusion.cpp
mkdir -p build
cd build
cmake .. -DSD_VULKAN=ON
cmake --build . --config Release -j$(nproc)
cd "$PROJECT_ROOT"

echo "=== 3. Setting Up Python & Hugging Face CLI ==="
python3 -m venv qwen-img2img-env
source qwen-img2img-env/bin/activate
pip install --upgrade pip setuptools wheel
pip install rembg[cpu] huggingface_hub[cli]

echo "=== 4. Downloading Model Assets via Hugging Face ==="
echo "[+] Downloading FLUX.2 Klein 4B Diffusion Model (Q4_K_S GGUF)..."
huggingface-cli download leejet/FLUX.2-klein-4B-GGUF \
  --include "*Q4_K_S.gguf" \
  --local-dir "$MODELS_DIR/diffusion" \
  --local-dir-use-symlinks False

echo "[+] Downloading Qwen3-4B Text Encoder (Q4_K_M GGUF)..."
huggingface-cli download unsloth/Qwen3-4B-GGUF \
  --include "*Q4_K_M.gguf" \
  --local-dir "$MODELS_DIR/llm" \
  --local-dir-use-symlinks False

echo "[+] Downloading FLUX.2 VAE..."
huggingface-cli download Comfy-Org/flux2-klein-4B \
  --include "*vae.safetensors" \
  --local-dir "$MODELS_DIR/vae" \
  --local-dir-use-symlinks False

echo "=== Installation & Asset Download Complete! ==="
echo "[+] All models are safely stored in: $MODELS_DIR"