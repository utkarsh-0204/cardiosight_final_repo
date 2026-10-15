#!/usr/bin/env bash
# =============================================================================
# CardioSight: Stop All Services Helper Script
# Safely terminates any local CardioSight processes on ports 3000, 8000, and 4200.
# =============================================================================

echo "Stopping CardioSight background services..."

# Safely terminate port listeners
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :4200 | xargs kill -9 2>/dev/null || true

echo "All CardioSight services (ports 3000, 8000, 4200) stopped cleanly."
