"""
FLARE API Models
Database models for emergency beacon system
"""

from django.db import models
from django.contrib.auth.models import AbstractUser
import uuid


class FlareUser(AbstractUser):
    """Extended user model for FLARE application."""
    
    ROLE_CHOICES = [
        ('civilian', 'Civilian'),
        ('rescuer', 'Professional Rescuer'),
        ('admin', 'Administrator'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='civilian')
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    device_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    is_verified_rescuer = models.BooleanField(default=False)
    organization = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    groups = models.ManyToManyField(
        'auth.Group',
        verbose_name='groups',
        blank=True,
        related_name='flare_users',
        related_query_name='flare_user',
    )
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        verbose_name='user permissions',
        blank=True,
        related_name='flare_users',
        related_query_name='flare_user',
    )

    class Meta:
        db_table = 'flare_users'
        verbose_name = 'Flare User'
        verbose_name_plural = 'Flare Users'

    def __str__(self):
        return f"{self.username} ({self.role})"


class PrivateGroup(models.Model):
    """Private groups for family/friends emergency tracking."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=8, unique=True)
    created_by = models.ForeignKey(
        FlareUser, 
        on_delete=models.CASCADE, 
        related_name='created_groups'
    )
    members = models.ManyToManyField(
        FlareUser, 
        through='GroupMembership',
        related_name='private_groups'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'private_groups'

    def __str__(self):
        return f"{self.name} ({self.code})"


class GroupMembership(models.Model):
    """Membership relation between users and private groups."""
    
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('member', 'Member'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(FlareUser, on_delete=models.CASCADE)
    group = models.ForeignKey(PrivateGroup, on_delete=models.CASCADE)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'group_memberships'
        unique_together = ['user', 'group']


class SOSBeacon(models.Model):
    """SOS Beacon broadcast by victims."""
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('rescued', 'Rescued'),
        ('cancelled', 'Cancelled'),
        ('expired', 'Expired'),
    ]
    
    MODE_CHOICES = [
        ('public', 'Public Emergency'),
        ('professional', 'Professional Rescue'),
        ('private', 'Private Group'),
    ]
    
    SIGNAL_TYPE_CHOICES = [
        ('bluetooth', 'Bluetooth LE'),
        ('wifi', 'WiFi Direct'),
        ('uwb', 'Ultra-Wideband'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        FlareUser, 
        on_delete=models.CASCADE, 
        related_name='sos_beacons',
        null=True,
        blank=True
    )
    device_id = models.CharField(max_length=255)
    device_name = models.CharField(max_length=255, blank=True, null=True)
    
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='public')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    signal_type = models.CharField(max_length=20, choices=SIGNAL_TYPE_CHOICES, default='bluetooth')
    
    private_group = models.ForeignKey(
        PrivateGroup, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='beacons'
    )
    
    battery_level = models.IntegerField(default=100)
    last_known_latitude = models.FloatField(null=True, blank=True)
    last_known_longitude = models.FloatField(null=True, blank=True)
    
    message = models.TextField(blank=True, null=True)
    emergency_type = models.CharField(max_length=100, blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'sos_beacons'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'mode']),
            models.Index(fields=['device_id']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"SOS Beacon {self.device_id[:8]} - {self.status}"


class BeaconDetection(models.Model):
    """Records when a rescuer detects a beacon."""
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    beacon = models.ForeignKey(
        SOSBeacon, 
        on_delete=models.CASCADE, 
        related_name='detections'
    )
    rescuer = models.ForeignKey(
        FlareUser, 
        on_delete=models.CASCADE, 
        related_name='detections',
        null=True,
        blank=True
    )
    rescuer_device_id = models.CharField(max_length=255)
    
    rssi = models.IntegerField()
    estimated_distance = models.FloatField()
    signal_type = models.CharField(max_length=20, default='bluetooth')
    
    rescuer_latitude = models.FloatField(null=True, blank=True)
    rescuer_longitude = models.FloatField(null=True, blank=True)
    
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'beacon_detections'
        ordering = ['-detected_at']
        indexes = [
            models.Index(fields=['beacon', 'detected_at']),
            models.Index(fields=['rescuer_device_id']),
        ]

    def __str__(self):
        return f"Detection of {self.beacon.device_id[:8]} at {self.estimated_distance}m"


class RescueSession(models.Model):
    """Tracks active rescue operations."""
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('abandoned', 'Abandoned'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    beacon = models.ForeignKey(
        SOSBeacon, 
        on_delete=models.CASCADE, 
        related_name='rescue_sessions'
    )
    rescuer = models.ForeignKey(
        FlareUser, 
        on_delete=models.CASCADE, 
        related_name='rescue_sessions',
        null=True,
        blank=True
    )
    rescuer_device_id = models.CharField(max_length=255)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    notes = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'rescue_sessions'
        ordering = ['-started_at']

    def __str__(self):
        return f"Rescue of {self.beacon.device_id[:8]} - {self.status}"


class HeatMapData(models.Model):
    """Stores heat map grid data for obstacle detection."""
    
    CELL_STATUS_CHOICES = [
        ('clear', 'Clear Path'),
        ('obstacle', 'Obstacle Detected'),
        ('unstable', 'Unstable Signal'),
        ('unknown', 'Unknown'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rescue_session = models.ForeignKey(
        RescueSession, 
        on_delete=models.CASCADE, 
        related_name='heat_map_data'
    )
    
    grid_x = models.IntegerField()
    grid_y = models.IntegerField()
    
    signal_strength = models.IntegerField()
    cell_status = models.CharField(max_length=20, choices=CELL_STATUS_CHOICES, default='unknown')
    
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'heat_map_data'
        unique_together = ['rescue_session', 'grid_x', 'grid_y']
        indexes = [
            models.Index(fields=['rescue_session', 'grid_x', 'grid_y']),
        ]

    def __str__(self):
        return f"HeatMap ({self.grid_x}, {self.grid_y}) - {self.cell_status}"


class EmergencyEvent(models.Model):
    """Large-scale emergency events for coordination."""
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('resolved', 'Resolved'),
    ]
    
    TYPE_CHOICES = [
        ('earthquake', 'Earthquake'),
        ('flood', 'Flood'),
        ('fire', 'Fire'),
        ('collapse', 'Building Collapse'),
        ('other', 'Other'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    event_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='other')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    
    description = models.TextField(blank=True, null=True)
    
    center_latitude = models.FloatField(null=True, blank=True)
    center_longitude = models.FloatField(null=True, blank=True)
    radius_km = models.FloatField(default=10.0)
    
    beacons = models.ManyToManyField(SOSBeacon, related_name='events', blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'emergency_events'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.event_type}) - {self.status}"
