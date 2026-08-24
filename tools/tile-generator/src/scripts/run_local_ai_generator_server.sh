#!/bin/bash
set -e

# Project paths
PROJECT_ROOT=$(pwd)
SD_SERVER="$PROJECT_ROOT/stable-diffusion.cpp/build/bin/sd-server"
MODELS_DIR="$PROJECT_ROOT/tools/tile-generator/models"

# Auto-detect downloaded models
DIFFUSION_MODEL=$(find "$MODELS_DIR/diffusion" -name "*Q4_K_S.gguf" | head -n 1)
LLM_MODEL=$(find "$MODELS_DIR/llm" -name "*Q4_K_M.gguf" | head -n 1)
VAE_MODEL=$(find "$MODELS_DIR/vae" -name "*vae.safetensors" | head -n 1)

# Check if models exist
if [ -z "$DIFFUSION_MODEL" ] || [ -z "$LLM_MODEL" ] || [ -z "$VAE_MODEL" ]; then
    echo "[-] Error: Missing model files. Did you run the install_deps.sh script?"
    exit 1
fi

echo "=== Starting sd-server (FLUX.2 Klein) ==="
echo "Port: 8081"
echo "Diffusion: $DIFFUSION_MODEL"
echo "Text Enc:  $LLM_MODEL"

"$SD_SERVER" \
  --diffusion-model "$DIFFUSION_MODEL" \
  --vae "$VAE_MODEL" \
  --llm "$LLM_MODEL" \
  --listen-port 8081 \
  --diffusion-fa