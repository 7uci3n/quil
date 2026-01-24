#!/bin/bash
# Permission diagnostic script for Quil bot deployment

echo "=== Quil Bot Permission Diagnostics ==="
echo ""

# Check service user
SERVICE_USER=$(systemctl show -p User bissel.service | cut -d= -f2)
SERVICE_GROUP=$(systemctl show -p Group bissel.service | cut -d= -f2)
echo "Service runs as: $SERVICE_USER:$SERVICE_GROUP"
echo ""

# Check data directory
echo "Data directory permissions:"
ls -la /srv/bissel-modern/data/ 2>/dev/null || ls -la ./data/ 2>/dev/null || echo "⚠️  data/ directory not found"
echo ""

# Check ownership
echo "Data directory ownership:"
stat -c "%U:%G" /srv/bissel-modern/data/ 2>/dev/null || stat -c "%U:%G" ./data/ 2>/dev/null || echo "⚠️  Cannot stat data/ directory"
echo ""

# Check if service user can write
echo "Write test (as current user):"
touch ./data/.write-test 2>&1 && echo "✅ Write successful" && rm ./data/.write-test || echo "❌ Write failed"
echo ""

# Recommended fix
echo "=== Recommended Fix ==="
echo "Run these commands on the production server:"
echo ""
echo "sudo chown -R $SERVICE_USER:$SERVICE_GROUP /srv/bissel-modern/data/"
echo "sudo chmod 755 /srv/bissel-modern/data/"
echo "sudo chmod 644 /srv/bissel-modern/data/remnant.sqlite*"
echo ""
echo "Or if migrations need to run as a different user:"
echo "sudo usermod -aG $SERVICE_GROUP \$(whoami)  # Add your user to the service group"
echo "sudo chmod 775 /srv/bissel-modern/data/      # Group write permission"
