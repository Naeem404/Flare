"""
FLARE API Serializers
JSON serialization for API endpoints
"""

from rest_framework import serializers
from .models import (
    FlareUser, PrivateGroup, GroupMembership, SOSBeacon,
    BeaconDetection, RescueSession, HeatMapData, EmergencyEvent
)


class FlareUserSerializer(serializers.ModelSerializer):
    """Serializer for FlareUser model."""
    
    class Meta:
        model = FlareUser
        fields = [
            'id', 'username', 'email', 'role', 'phone_number',
            'device_id', 'is_verified_rescuer', 'organization',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class FlareUserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users."""
    
    password = serializers.CharField(write_only=True, min_length=8)
    
    class Meta:
        model = FlareUser
        fields = [
            'username', 'email', 'password', 'role', 'phone_number',
            'device_id', 'organization'
        ]
    
    def create(self, validated_data):
        password = validated_data.pop('password')
        user = FlareUser(**validated_data)
        user.set_password(password)
        user.save()
        return user


class GroupMembershipSerializer(serializers.ModelSerializer):
    """Serializer for group membership."""
    
    user = FlareUserSerializer(read_only=True)
    
    class Meta:
        model = GroupMembership
        fields = ['id', 'user', 'role', 'joined_at']
        read_only_fields = ['id', 'joined_at']


class PrivateGroupSerializer(serializers.ModelSerializer):
    """Serializer for private groups."""
    
    created_by = FlareUserSerializer(read_only=True)
    member_count = serializers.SerializerMethodField()
    
    class Meta:
        model = PrivateGroup
        fields = [
            'id', 'name', 'code', 'created_by', 'member_count',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'code', 'created_at', 'updated_at']
    
    def get_member_count(self, obj):
        return obj.members.count()


class PrivateGroupDetailSerializer(PrivateGroupSerializer):
    """Detailed serializer including members."""
    
    memberships = GroupMembershipSerializer(
        source='groupmembership_set', 
        many=True, 
        read_only=True
    )
    
    class Meta(PrivateGroupSerializer.Meta):
        fields = PrivateGroupSerializer.Meta.fields + ['memberships']


class SOSBeaconSerializer(serializers.ModelSerializer):
    """Serializer for SOS beacons."""
    
    user = FlareUserSerializer(read_only=True)
    time_active = serializers.SerializerMethodField()
    
    class Meta:
        model = SOSBeacon
        fields = [
            'id', 'user', 'device_id', 'device_name', 'mode', 'status',
            'signal_type', 'private_group', 'battery_level',
            'last_known_latitude', 'last_known_longitude',
            'message', 'emergency_type', 'time_active',
            'created_at', 'updated_at', 'expires_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_time_active(self, obj):
        from django.utils import timezone
        if obj.status == 'active':
            delta = timezone.now() - obj.created_at
            return int(delta.total_seconds())
        return None


class SOSBeaconCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating SOS beacons."""
    
    class Meta:
        model = SOSBeacon
        fields = [
            'device_id', 'device_name', 'mode', 'signal_type',
            'private_group', 'battery_level', 'last_known_latitude',
            'last_known_longitude', 'message', 'emergency_type'
        ]
    
    def validate(self, data):
        mode = data.get('mode', 'public')
        private_group = data.get('private_group')
        
        if mode == 'private' and not private_group:
            raise serializers.ValidationError({
                'private_group': 'Private group is required for private mode.'
            })
        
        return data


class BeaconDetectionSerializer(serializers.ModelSerializer):
    """Serializer for beacon detections."""
    
    beacon = SOSBeaconSerializer(read_only=True)
    beacon_id = serializers.UUIDField(write_only=True)
    
    class Meta:
        model = BeaconDetection
        fields = [
            'id', 'beacon', 'beacon_id', 'rescuer', 'rescuer_device_id',
            'rssi', 'estimated_distance', 'signal_type',
            'rescuer_latitude', 'rescuer_longitude', 'detected_at'
        ]
        read_only_fields = ['id', 'detected_at']


class BeaconDetectionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating beacon detections."""
    
    class Meta:
        model = BeaconDetection
        fields = [
            'beacon', 'rescuer_device_id', 'rssi', 'estimated_distance',
            'signal_type', 'rescuer_latitude', 'rescuer_longitude'
        ]


class RescueSessionSerializer(serializers.ModelSerializer):
    """Serializer for rescue sessions."""
    
    beacon = SOSBeaconSerializer(read_only=True)
    rescuer = FlareUserSerializer(read_only=True)
    duration_seconds = serializers.SerializerMethodField()
    
    class Meta:
        model = RescueSession
        fields = [
            'id', 'beacon', 'rescuer', 'rescuer_device_id', 'status',
            'started_at', 'completed_at', 'duration_seconds', 'notes'
        ]
        read_only_fields = ['id', 'started_at']
    
    def get_duration_seconds(self, obj):
        from django.utils import timezone
        end_time = obj.completed_at or timezone.now()
        delta = end_time - obj.started_at
        return int(delta.total_seconds())


class RescueSessionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating rescue sessions."""
    
    class Meta:
        model = RescueSession
        fields = ['beacon', 'rescuer_device_id', 'notes']


class HeatMapDataSerializer(serializers.ModelSerializer):
    """Serializer for heat map data."""
    
    class Meta:
        model = HeatMapData
        fields = [
            'id', 'rescue_session', 'grid_x', 'grid_y',
            'signal_strength', 'cell_status', 'latitude', 'longitude',
            'recorded_at'
        ]
        read_only_fields = ['id', 'recorded_at']


class HeatMapGridSerializer(serializers.Serializer):
    """Serializer for heat map grid response."""
    
    grid = serializers.ListField(
        child=serializers.ListField(
            child=serializers.DictField()
        )
    )
    min_x = serializers.IntegerField()
    max_x = serializers.IntegerField()
    min_y = serializers.IntegerField()
    max_y = serializers.IntegerField()
    cell_count = serializers.IntegerField()


class EmergencyEventSerializer(serializers.ModelSerializer):
    """Serializer for emergency events."""
    
    beacon_count = serializers.SerializerMethodField()
    
    class Meta:
        model = EmergencyEvent
        fields = [
            'id', 'name', 'event_type', 'status', 'description',
            'center_latitude', 'center_longitude', 'radius_km',
            'beacon_count', 'created_at', 'updated_at', 'resolved_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_beacon_count(self, obj):
        return obj.beacons.filter(status='active').count()


class EmergencyEventDetailSerializer(EmergencyEventSerializer):
    """Detailed serializer including beacons."""
    
    beacons = SOSBeaconSerializer(many=True, read_only=True)
    
    class Meta(EmergencyEventSerializer.Meta):
        fields = EmergencyEventSerializer.Meta.fields + ['beacons']


class RSSIDistanceSerializer(serializers.Serializer):
    """Serializer for RSSI to distance calculation."""
    
    rssi = serializers.IntegerField(required=True)
    tx_power = serializers.IntegerField(default=-59)
    environment_factor = serializers.FloatField(default=2.0)


class NavigationUpdateSerializer(serializers.Serializer):
    """Serializer for navigation updates."""
    
    beacon_id = serializers.UUIDField(required=True)
    current_rssi = serializers.IntegerField(required=True)
    previous_rssi = serializers.IntegerField(required=False, allow_null=True)
    movement_direction = serializers.CharField(required=False, allow_null=True)
    rescuer_latitude = serializers.FloatField(required=False, allow_null=True)
    rescuer_longitude = serializers.FloatField(required=False, allow_null=True)
