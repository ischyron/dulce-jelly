# Install alien to convert RPM to DEB
sudo apt install alien

# Download v26 aarch64 RPM
wget https://github.com/Seagate/openSeaChest/releases/download/v26.03.0/openseachest-26.03.0-1.aarch64.rpm

# Convert to deb
sudo alien --to-deb openseachest-26.03.0-1.aarch64.rpm

# Install — filename may differ slightly after conversion, check with ls
ls *.deb
sudo dpkg -i openseachest_26.03.0-2_arm64.deb

# Verify version
openSeaChest_PowerControl --version