"""
FLARE API Utilities
Helper functions and custom handlers
"""

import math
import random
import string
import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Custom exception handler for consistent error responses.
    """
    response = exception_handler(exc, context)
    
    if response is not None:
        custom_response_data = {
            'success': False,
            'error': {
                'code': response.status_code,
                'message': get_error_message(response),
                'details': response.data
            }
        }
        response.data = custom_response_data
    else:
        logger.exception(f"Unhandled exception: {exc}")
        return Response({
            'success': False,
            'error': {
                'code': 500,
                'message': 'An unexpected error occurred.',
                'details': str(exc) if logger.isEnabledFor(logging.DEBUG) else None
            }
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    return response


def get_error_message(response):
    """Extract a human-readable error message from response."""
    status_messages = {
        400: 'Bad Request',
        401: 'Authentication Required',
        403: 'Permission Denied',
        404: 'Resource Not Found',
        405: 'Method Not Allowed',
        409: 'Conflict',
        422: 'Validation Error',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
    }
    return status_messages.get(response.status_code, 'Error')


def generate_group_code(length=6):
    """Generate a unique group code."""
    characters = string.ascii_uppercase + string.digits
    characters = characters.replace('O', '').replace('0', '').replace('I', '').replace('1', '')
    return ''.join(random.choices(characters, k=length))


def calculate_distance_from_rssi(rssi, tx_power=-59, environment_factor=2.0):
    """
    Calculate estimated distance from RSSI value.
    
    Formula: distance = 10 ^ ((tx_power - rssi) / (10 * n))
    
    Args:
        rssi: Received Signal Strength Indicator (negative dBm)
        tx_power: Calibrated TX power at 1 meter (default -59 dBm)
        environment_factor: Path loss exponent (n)
            - 2.0: Free space
            - 2.5-3.0: Indoor with some obstacles
            - 3.0-4.0: Indoor with walls
            - 4.0-5.0: Heavy obstacles/rubble
    
    Returns:
        Estimated distance in meters
    """
    if rssi >= 0:
        return 0.0
    
    try:
        ratio = (tx_power - rssi) / (10 * environment_factor)
        distance = math.pow(10, ratio)
        return round(distance, 2)
    except (ValueError, OverflowError) as e:
        logger.warning(f"Distance calculation error: {e}")
        return 999.0


def get_signal_quality(rssi):
    """
    Get signal quality description from RSSI.
    
    Returns:
        Tuple of (quality_level, description)
    """
    if rssi >= -50:
        return ('excellent', 'Excellent - Very close')
    elif rssi >= -60:
        return ('good', 'Good - Within 5m')
    elif rssi >= -70:
        return ('fair', 'Fair - Within 10m')
    elif rssi >= -80:
        return ('weak', 'Weak - Within 20m')
    elif rssi >= -90:
        return ('very_weak', 'Very Weak - Far away')
    else:
        return ('minimal', 'Minimal - At range limit')


def get_navigation_guidance(current_rssi, previous_rssi, threshold=3):
    """
    Provide navigation guidance based on RSSI changes.
    
    Args:
        current_rssi: Current RSSI reading
        previous_rssi: Previous RSSI reading
        threshold: Minimum change to consider significant
    
    Returns:
        Dictionary with guidance information
    """
    if previous_rssi is None:
        return {
            'direction': 'unknown',
            'message': 'Start moving to calibrate direction',
            'confidence': 0.0
        }
    
    change = current_rssi - previous_rssi
    
    if abs(change) < threshold:
        return {
            'direction': 'stable',
            'message': 'Signal stable - try moving in a different direction',
            'confidence': 0.3,
            'rssi_change': change
        }
    elif change > 0:
        confidence = min(1.0, abs(change) / 10.0)
        return {
            'direction': 'closer',
            'message': 'Getting closer! Keep going this direction ✓',
            'confidence': confidence,
            'rssi_change': change
        }
    else:
        confidence = min(1.0, abs(change) / 10.0)
        return {
            'direction': 'farther',
            'message': 'Moving away - turn around ↺',
            'confidence': confidence,
            'rssi_change': change
        }


def classify_cell_status(signal_readings):
    """
    Classify a heat map cell based on signal readings.
    
    Args:
        signal_readings: List of RSSI readings for this cell
    
    Returns:
        Cell status string
    """
    if not signal_readings:
        return 'unknown'
    
    avg_signal = sum(signal_readings) / len(signal_readings)
    signal_variance = sum((x - avg_signal) ** 2 for x in signal_readings) / len(signal_readings)
    
    if signal_variance > 100:
        return 'unstable'
    
    if avg_signal >= -70:
        return 'clear'
    elif avg_signal >= -85:
        return 'unstable'
    else:
        return 'obstacle'


def estimate_position_from_beacons(beacon_distances):
    """
    Estimate position using trilateration from multiple beacons.
    
    Args:
        beacon_distances: List of dicts with 'x', 'y', 'distance' keys
    
    Returns:
        Estimated (x, y) position or None if insufficient data
    """
    if len(beacon_distances) < 3:
        return None
    
    try:
        b1, b2, b3 = beacon_distances[:3]
        
        A = 2 * (b2['x'] - b1['x'])
        B = 2 * (b2['y'] - b1['y'])
        C = b1['distance']**2 - b2['distance']**2 - b1['x']**2 + b2['x']**2 - b1['y']**2 + b2['y']**2
        
        D = 2 * (b3['x'] - b2['x'])
        E = 2 * (b3['y'] - b2['y'])
        F = b2['distance']**2 - b3['distance']**2 - b2['x']**2 + b3['x']**2 - b2['y']**2 + b3['y']**2
        
        denominator = A * E - B * D
        if abs(denominator) < 0.0001:
            return None
        
        x = (C * E - B * F) / denominator
        y = (A * F - C * D) / denominator
        
        return (round(x, 2), round(y, 2))
    except (KeyError, ZeroDivisionError, ValueError) as e:
        logger.warning(f"Trilateration error: {e}")
        return None


def format_distance(meters):
    """Format distance for display."""
    if meters < 1:
        return f"{int(meters * 100)} cm"
    elif meters < 10:
        return f"{meters:.1f} m"
    else:
        return f"{int(meters)} m"


def format_battery_status(level):
    """Format battery level with warning indicators."""
    if level <= 10:
        return f"⚠️ CRITICAL: {level}%"
    elif level <= 20:
        return f"⚠️ Low: {level}%"
    elif level <= 50:
        return f"{level}%"
    else:
        return f"✓ {level}%"
