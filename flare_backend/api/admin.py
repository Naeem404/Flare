"""
FLARE Admin Configuration
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    FlareUser, PrivateGroup, GroupMembership, SOSBeacon,
    BeaconDetection, RescueSession, HeatMapData, EmergencyEvent
)


@admin.register(FlareUser)
class FlareUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'role', 'is_verified_rescuer', 'organization', 'created_at']
    list_filter = ['role', 'is_verified_rescuer', 'is_active']
    search_fields = ['username', 'email', 'device_id', 'organization']
    ordering = ['-created_at']
    
    fieldsets = UserAdmin.fieldsets + (
        ('FLARE Info', {
            'fields': ('role', 'phone_number', 'device_id', 'is_verified_rescuer', 'organization')
        }),
    )


@admin.register(PrivateGroup)
class PrivateGroupAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'created_by', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'code']
    readonly_fields = ['code', 'created_at', 'updated_at']


@admin.register(GroupMembership)
class GroupMembershipAdmin(admin.ModelAdmin):
    list_display = ['user', 'group', 'role', 'joined_at']
    list_filter = ['role', 'joined_at']
    search_fields = ['user__username', 'group__name']


@admin.register(SOSBeacon)
class SOSBeaconAdmin(admin.ModelAdmin):
    list_display = ['device_id', 'status', 'mode', 'battery_level', 'signal_type', 'created_at']
    list_filter = ['status', 'mode', 'signal_type', 'created_at']
    search_fields = ['device_id', 'device_name', 'message']
    readonly_fields = ['created_at', 'updated_at']
    
    actions = ['mark_rescued', 'mark_expired']
    
    def mark_rescued(self, request, queryset):
        queryset.update(status='rescued')
    mark_rescued.short_description = "Mark selected beacons as rescued"
    
    def mark_expired(self, request, queryset):
        queryset.update(status='expired')
    mark_expired.short_description = "Mark selected beacons as expired"


@admin.register(BeaconDetection)
class BeaconDetectionAdmin(admin.ModelAdmin):
    list_display = ['beacon', 'rescuer_device_id', 'rssi', 'estimated_distance', 'detected_at']
    list_filter = ['signal_type', 'detected_at']
    search_fields = ['beacon__device_id', 'rescuer_device_id']
    readonly_fields = ['detected_at']


@admin.register(RescueSession)
class RescueSessionAdmin(admin.ModelAdmin):
    list_display = ['beacon', 'rescuer_device_id', 'status', 'started_at', 'completed_at']
    list_filter = ['status', 'started_at']
    search_fields = ['beacon__device_id', 'rescuer_device_id']
    readonly_fields = ['started_at']


@admin.register(HeatMapData)
class HeatMapDataAdmin(admin.ModelAdmin):
    list_display = ['rescue_session', 'grid_x', 'grid_y', 'cell_status', 'signal_strength', 'recorded_at']
    list_filter = ['cell_status', 'recorded_at']
    readonly_fields = ['recorded_at']


@admin.register(EmergencyEvent)
class EmergencyEventAdmin(admin.ModelAdmin):
    list_display = ['name', 'event_type', 'status', 'created_at', 'resolved_at']
    list_filter = ['status', 'event_type', 'created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['created_at', 'updated_at']
    
    actions = ['mark_resolved']
    
    def mark_resolved(self, request, queryset):
        from django.utils import timezone
        queryset.update(status='resolved', resolved_at=timezone.now())
    mark_resolved.short_description = "Mark selected events as resolved"
