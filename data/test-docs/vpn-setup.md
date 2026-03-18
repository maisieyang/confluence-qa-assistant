# VPN Setup Guide

## Overview

All employees must use the company VPN to access internal services when working remotely. The VPN uses **WireGuard** protocol for fast and secure connections.

## Installation

### macOS
1. Download WireGuard from the App Store or https://www.wireguard.com/install/
2. Download your VPN configuration file from https://vpn.company.com/config
3. Open WireGuard → Import Tunnel → select the downloaded `.conf` file
4. Click "Activate" to connect

### Windows
1. Download WireGuard installer from https://www.wireguard.com/install/
2. Follow the same steps as macOS

### Linux
```bash
sudo apt install wireguard
sudo cp company-vpn.conf /etc/wireguard/
sudo wg-quick up company-vpn
```

## Configuration

Your VPN configuration file is unique to your account. If you need a new one (e.g., lost device), request a regeneration through the IT Service Desk.

**VPN Server**: `vpn.company.com:51820`
**DNS**: `10.0.0.2` (internal DNS server)
**Allowed IPs**: `10.0.0.0/8` (split tunnel — only internal traffic goes through VPN)

## Troubleshooting

### Cannot connect to VPN
1. Check your internet connection
2. Verify the VPN configuration file is up to date
3. Try disconnecting and reconnecting
4. If issue persists, contact IT Support via `#it-support` Slack channel

### Slow connection
The VPN uses split tunneling — only internal traffic routes through the VPN. If you experience slowness:
1. Check if you're connected to the correct VPN server (Singapore region)
2. Run `ping 10.0.0.1` to check latency (should be < 50ms in SGT timezone)
3. For users outside Southeast Asia, contact IT to get access to a regional VPN endpoint

### VPN disconnects frequently
This usually indicates network instability. Try:
1. Switch to a wired connection if using WiFi
2. Disable battery optimization for WireGuard on mobile devices
3. Check if your firewall is blocking UDP port 51820
