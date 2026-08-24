#!/bin/bash
set -e

echo "=== Starting Complete Local AI Setup & Server Initialization ==="

# Project paths
PROJECT_ROOT=$(pwd)
MODELS_DIR="$PROJECT_ROOT/tools/tile-generator/models"
SD_SERVER_BIN="$PROJECT_ROOT/stable-diffusion.cpp/build/bin/sd-server"

# Ensure directories exist
mkdir -p "$MODELS_DIR/diffusion" "$MODELS_DIR/llm" "$MODELS_DIR/vae"

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
cd "$PROJECT_ROOT"
echo "[+] stable-diffusion.cpp built successfully!"

# 3. Set up Python Environment & Utilities (Rembg, HF Hub)
echo "[+] Setting up Python virtual environment..."
python3 -m venv qwen-img2img-env
source qwen-img2img-env/bin/activate

echo "[+] Upgrading pip and installing background removal + huggingface tools..."
pip install --upgrade pip setuptools wheel
pip install "rembg[cpu]" "huggingface_hub[cli]"

# 4. Download Model Assets via Hugging Face CLI
echo "=== Downloading Model Assets into local folders ==="

echo "[->] Downloading FLUX.2 Klein 4B Diffusion Model..."
huggingface-cli download leejet/FLUX.2-klein-4B-GGUF \
  --include "*Q4_K_S.gguf" \
  --local-dir "$MODELS_DIR/diffusion" \
  --local-dir-use-symlinks False

echo "[->] Downloading Qwen3-4B Text Encoder (Q4_K_M GGUF)..."
huggingface-cli download unsloth/Qwen3-4B-GGUF \
  --include "*Q4_K_M.gguf" \
  --local-dir "$MODELS_DIR/llm" \
  --local-dir-use-symlinks False

echo "[->] Downloading FLUX.2 VAE..."
huggingface-cli download Comfy-Org/flux2-klein-4B \
  --include "*vae.safetensors" \
  --local-dir "$MODELS_DIR/vae" \
  --local-dir-use-symlinks False

# 5. Resolve Model File Paths
DIFFUSION_MODEL=$(find "$MODELS_DIR/diffusion" -name "*Q4_K_S.gguf" | head -n 1)
LLM_MODEL=$(find "$MODELS_DIR/llm" -name "*Q4_K_M.gguf" | head -n 1)
VAE_MODEL=$(find "$MODELS_DIR/vae" -name "*vae.safetensors" | head -n 1)

if [ -z "$DIFFUSION_MODEL" ] || [ -z "$LLM_MODEL" ] || [ -z "$VAE_MODEL" ]; then
    echo "[-] Error: Model files missing after download. Check internet connection."
    exit 1
fi

echo "=== Setup Complete! Launching sd-server on Port 8081... ==="
echo "Diffusion: $DIFFUSION_MODEL"
echo "Text Enc:  $LLM_MODEL"
echo "VAE:       $VAE_MODEL"

# 6. Execute server
"$SD_SERVER_BIN" \
  --diffusion-model "$DIFFUSION_MODEL" \
  --vae "$VAE_MODEL" \
  --llm "$LLM_MODEL" \
  --listen-port 8081 \
  --diffusion-fa