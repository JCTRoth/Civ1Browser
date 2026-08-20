#!/bin/bash

# Check if Inkscape is installed
if ! command -v inkscape &> /dev/null; then
    echo "Inkscape is not installed. Installing..."
    sudo dnf install inkscape -y
fi

# Process each SVG file in-place
for svg_file in *.svg; do
    if [ -f "$svg_file" ]; then
        echo "Cropping: $svg_file"
        # Use a temporary file to avoid corruption
        temp_file="${svg_file}.tmp"
        inkscape --export-type=svg --export-filename="$temp_file" --export-plain-svg "$svg_file" --export-area-drawing
        mv "$temp_file" "$svg_file"
    fi
done

echo "All SVGs cropped in-place."