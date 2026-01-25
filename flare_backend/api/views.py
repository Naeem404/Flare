"""
FLARE API Views
REST API endpoints for emergency beacon system
"""

import logging
from django.utils import timezone
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    FlareUser, PrivateGroup, GroupMembership, SOSBeacon,
    BeaconDetection, RescueSession, HeatMapData, EmergencyEvent
)
from .serializers import (
    FlareUserSerializer, FlareUserCreateSerializer,
    PrivateGroupSerializer, PrivateGroupDetailSerializer,
    GroupMembershipSerializer, SOSBeaconSerializer, SOSBeaconCreateSerializer,
    BeaconDetectionSerializer, BeaconDetectionCreateSerializer,
    RescueSessionSerializer, RescueSessionCreateSerializer,
    HeatMapDataSerializer, HeatMapGridSerializer,
    EmergencyEventSerializer, EmergencyEventDetailSerializer,
    RSSIDistanceSerializer, NavigationUpdateSerializer
)
from .utils import (
    generate_group_code, calculate_distance_from_rssi,
    get_signal_quality, get_navigation_guidance,
    classify_cell_status, format_distance, format_battery_status
)

logger = logging.getLogger(__name__)


class FlareUserViewSet(viewsets.ModelViewSet):
    """ViewSet for user management."""
    
    queryset = FlareUser.objects.all()
    serializer_class = FlareUserSerializer
    
    def get_serializer_class(self):
        if self.action == 'create':
            return FlareUserCreateSerializer
        return FlareUserSerializer
    
    @action(detail=False, methods=['get'])
    def by_device(self, request):
        """Get user by device ID."""
        device_id = request.query_params.get('device_id')
        if not device_id:
            return Response(
                {'error': 'device_id parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            user = FlareUser.objects.get(device_id=device_id)
            serializer = self.get_serializer(user)
            return Response(serializer.data)
        except FlareUser.DoesNotExist:
            return Response(
                {'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=False, methods=['get'])
    def rescuers(self, request):
        """Get all verified rescuers."""
        rescuers = FlareUser.objects.filter(
            role='rescuer',
            is_verified_rescuer=True
        )
        serializer = self.get_serializer(rescuers, many=True)
        return Response(serializer.data)


class PrivateGroupViewSet(viewsets.ModelViewSet):
    """ViewSet for private group management."""
    
    queryset = PrivateGroup.objects.filter(is_active=True)
    serializer_class = PrivateGroupSerializer
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PrivateGroupDetailSerializer
        return PrivateGroupSerializer
    
    def perform_create(self, serializer):
        code = generate_group_code()
        while PrivateGroup.objects.filter(code=code).exists():
            code = generate_group_code()
        
        group = serializer.save(code=code)
        
        user_id = self.request.data.get('created_by_id')
        if user_id:
            try:
                user = FlareUser.objects.get(id=user_id)
                group.created_by = user
                group.save()
                GroupMembership.objects.create(
                    user=user,
                    group=group,
                    role='admin'
                )
            except FlareUser.DoesNotExist:
                pass
    
    @action(detail=False, methods=['post'])
    def join(self, request):
        """Join a group using code."""
        code = request.data.get('code')
        user_id = request.data.get('user_id')
        device_id = request.data.get('device_id')
        
        if not code:
            return Response(
                {'error': 'Group code required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            group = PrivateGroup.objects.get(code=code.upper(), is_active=True)
        except PrivateGroup.DoesNotExist:
            return Response(
                {'error': 'Invalid group code'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        user = None
        if user_id:
            try:
                user = FlareUser.objects.get(id=user_id)
            except FlareUser.DoesNotExist:
                pass
        elif device_id:
            user, _ = FlareUser.objects.get_or_create(
                device_id=device_id,
                defaults={'username': f'device_{device_id[:8]}'}
            )
        
        if user:
            membership, created = GroupMembership.objects.get_or_create(
                user=user,
                group=group,
                defaults={'role': 'member'}
            )
            
            if not created:
                return Response(
                    {'message': 'Already a member of this group'},
                    status=status.HTTP_200_OK
                )
        
        serializer = PrivateGroupDetailSerializer(group)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """Leave a group."""
        group = self.get_object()
        user_id = request.data.get('user_id')
        
        if not user_id:
            return Response(
                {'error': 'user_id required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            membership = GroupMembership.objects.get(
                user_id=user_id,
                group=group
            )
            membership.delete()
            return Response({'message': 'Left group successfully'})
        except GroupMembership.DoesNotExist:
            return Response(
                {'error': 'Not a member of this group'},
                status=status.HTTP_404_NOT_FOUND
            )


class SOSBeaconViewSet(viewsets.ModelViewSet):
    """ViewSet for SOS beacon management."""
    
    queryset = SOSBeacon.objects.all()
    serializer_class = SOSBeaconSerializer
    
    def get_serializer_class(self):
        if self.action == 'create':
            return SOSBeaconCreateSerializer
        return SOSBeaconSerializer
    
    def get_queryset(self):
        queryset = SOSBeacon.objects.all()
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        mode_filter = self.request.query_params.get('mode')
        if mode_filter:
            queryset = queryset.filter(mode=mode_filter)
        
        device_id = self.request.query_params.get('device_id')
        if device_id:
            queryset = queryset.filter(device_id=device_id)
        
        return queryset
    
    def perform_create(self, serializer):
        user_id = self.request.data.get('user_id')
        user = None
        if user_id:
            try:
                user = FlareUser.objects.get(id=user_id)
            except FlareUser.DoesNotExist:
                pass
        
        serializer.save(user=user, status='active')
        logger.info(f"New SOS beacon created: {serializer.instance.device_id}")
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active beacons."""
        mode = request.query_params.get('mode', 'public')
        group_id = request.query_params.get('group_id')
        
        queryset = SOSBeacon.objects.filter(status='active')
        
        if mode == 'public':
            queryset = queryset.filter(mode='public')
        elif mode == 'professional':
            queryset = queryset.filter(mode__in=['public', 'professional'])
        elif mode == 'private' and group_id:
            queryset = queryset.filter(mode='private', private_group_id=group_id)
        
        serializer = SOSBeaconSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update beacon status."""
        beacon = self.get_object()
        new_status = request.data.get('status')
        
        valid_statuses = ['active', 'rescued', 'cancelled', 'expired']
        if new_status not in valid_statuses:
            return Response(
                {'error': f'Invalid status. Must be one of: {valid_statuses}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        beacon.status = new_status
        beacon.save()
        
        logger.info(f"Beacon {beacon.device_id} status updated to {new_status}")
        
        serializer = SOSBeaconSerializer(beacon)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_battery(self, request, pk=None):
        """Update beacon battery level."""
        beacon = self.get_object()
        battery_level = request.data.get('battery_level')
        
        if battery_level is None or not (0 <= battery_level <= 100):
            return Response(
                {'error': 'battery_level must be between 0 and 100'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        beacon.battery_level = battery_level
        beacon.save()
        
        serializer = SOSBeaconSerializer(beacon)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def update_location(self, request, pk=None):
        """Update beacon's last known location."""
        beacon = self.get_object()
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        
        if latitude is not None:
            beacon.last_known_latitude = latitude
        if longitude is not None:
            beacon.last_known_longitude = longitude
        beacon.save()
        
        serializer = SOSBeaconSerializer(beacon)
        return Response(serializer.data)


class BeaconDetectionViewSet(viewsets.ModelViewSet):
    """ViewSet for beacon detection records."""
    
    queryset = BeaconDetection.objects.all()
    serializer_class = BeaconDetectionSerializer
    
    def get_serializer_class(self):
        if self.action == 'create':
            return BeaconDetectionCreateSerializer
        return BeaconDetectionSerializer
    
    def get_queryset(self):
        queryset = BeaconDetection.objects.all()
        
        beacon_id = self.request.query_params.get('beacon_id')
        if beacon_id:
            queryset = queryset.filter(beacon_id=beacon_id)
        
        rescuer_device_id = self.request.query_params.get('rescuer_device_id')
        if rescuer_device_id:
            queryset = queryset.filter(rescuer_device_id=rescuer_device_id)
        
        return queryset.order_by('-detected_at')[:100]
    
    @action(detail=False, methods=['post'])
    def batch_create(self, request):
        """Create multiple detection records at once."""
        detections = request.data.get('detections', [])
        
        if not detections:
            return Response(
                {'error': 'detections array required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        created = []
        errors = []
        
        for detection_data in detections:
            serializer = BeaconDetectionCreateSerializer(data=detection_data)
            if serializer.is_valid():
                serializer.save()
                created.append(serializer.data)
            else:
                errors.append({
                    'data': detection_data,
                    'errors': serializer.errors
                })
        
        return Response({
            'created': len(created),
            'errors': errors
        }, status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST)


class RescueSessionViewSet(viewsets.ModelViewSet):
    """ViewSet for rescue session management."""
    
    queryset = RescueSession.objects.all()
    serializer_class = RescueSessionSerializer
    
    def get_serializer_class(self):
        if self.action == 'create':
            return RescueSessionCreateSerializer
        return RescueSessionSerializer
    
    def get_queryset(self):
        queryset = RescueSession.objects.all()
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        beacon_id = self.request.query_params.get('beacon_id')
        if beacon_id:
            queryset = queryset.filter(beacon_id=beacon_id)
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark rescue session as completed."""
        session = self.get_object()
        session.status = 'completed'
        session.completed_at = timezone.now()
        session.notes = request.data.get('notes', session.notes)
        session.save()
        
        session.beacon.status = 'rescued'
        session.beacon.save()
        
        logger.info(f"Rescue session {session.id} completed")
        
        serializer = RescueSessionSerializer(session)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def abandon(self, request, pk=None):
        """Mark rescue session as abandoned."""
        session = self.get_object()
        session.status = 'abandoned'
        session.completed_at = timezone.now()
        session.notes = request.data.get('notes', session.notes)
        session.save()
        
        logger.info(f"Rescue session {session.id} abandoned")
        
        serializer = RescueSessionSerializer(session)
        return Response(serializer.data)


class HeatMapDataViewSet(viewsets.ModelViewSet):
    """ViewSet for heat map data."""
    
    queryset = HeatMapData.objects.all()
    serializer_class = HeatMapDataSerializer
    
    def get_queryset(self):
        queryset = HeatMapData.objects.all()
        
        session_id = self.request.query_params.get('session_id')
        if session_id:
            queryset = queryset.filter(rescue_session_id=session_id)
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def grid(self, request):
        """Get heat map as a 2D grid."""
        session_id = request.query_params.get('session_id')
        
        if not session_id:
            return Response(
                {'error': 'session_id parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        data_points = HeatMapData.objects.filter(rescue_session_id=session_id)
        
        if not data_points.exists():
            return Response({
                'grid': [],
                'min_x': 0,
                'max_x': 0,
                'min_y': 0,
                'max_y': 0,
                'cell_count': 0
            })
        
        min_x = min(p.grid_x for p in data_points)
        max_x = max(p.grid_x for p in data_points)
        min_y = min(p.grid_y for p in data_points)
        max_y = max(p.grid_y for p in data_points)
        
        grid = {}
        for point in data_points:
            key = (point.grid_x, point.grid_y)
            grid[key] = {
                'x': point.grid_x,
                'y': point.grid_y,
                'status': point.cell_status,
                'signal_strength': point.signal_strength
            }
        
        grid_2d = []
        for y in range(min_y, max_y + 1):
            row = []
            for x in range(min_x, max_x + 1):
                cell = grid.get((x, y), {
                    'x': x,
                    'y': y,
                    'status': 'unknown',
                    'signal_strength': None
                })
                row.append(cell)
            grid_2d.append(row)
        
        return Response({
            'grid': grid_2d,
            'min_x': min_x,
            'max_x': max_x,
            'min_y': min_y,
            'max_y': max_y,
            'cell_count': len(data_points)
        })
    
    @action(detail=False, methods=['post'])
    def batch_update(self, request):
        """Batch update heat map cells."""
        session_id = request.data.get('session_id')
        cells = request.data.get('cells', [])
        
        if not session_id or not cells:
            return Response(
                {'error': 'session_id and cells array required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            session = RescueSession.objects.get(id=session_id)
        except RescueSession.DoesNotExist:
            return Response(
                {'error': 'Rescue session not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        updated = 0
        for cell in cells:
            obj, created = HeatMapData.objects.update_or_create(
                rescue_session=session,
                grid_x=cell.get('x', 0),
                grid_y=cell.get('y', 0),
                defaults={
                    'signal_strength': cell.get('signal_strength', 0),
                    'cell_status': cell.get('status', 'unknown'),
                    'latitude': cell.get('latitude'),
                    'longitude': cell.get('longitude')
                }
            )
            updated += 1
        
        return Response({
            'updated': updated,
            'session_id': str(session_id)
        })


class EmergencyEventViewSet(viewsets.ModelViewSet):
    """ViewSet for emergency event management."""
    
    queryset = EmergencyEvent.objects.all()
    serializer_class = EmergencyEventSerializer
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return EmergencyEventDetailSerializer
        return EmergencyEventSerializer
    
    def get_queryset(self):
        queryset = EmergencyEvent.objects.all()
        
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        event_type = self.request.query_params.get('type')
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def add_beacon(self, request, pk=None):
        """Add a beacon to an emergency event."""
        event = self.get_object()
        beacon_id = request.data.get('beacon_id')
        
        if not beacon_id:
            return Response(
                {'error': 'beacon_id required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            beacon = SOSBeacon.objects.get(id=beacon_id)
            event.beacons.add(beacon)
            serializer = EmergencyEventDetailSerializer(event)
            return Response(serializer.data)
        except SOSBeacon.DoesNotExist:
            return Response(
                {'error': 'Beacon not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Mark event as resolved."""
        event = self.get_object()
        event.status = 'resolved'
        event.resolved_at = timezone.now()
        event.save()
        
        serializer = EmergencyEventSerializer(event)
        return Response(serializer.data)


class NavigationAPIView(APIView):
    """API endpoints for navigation calculations."""
    
    def post(self, request):
        """Calculate navigation guidance from RSSI readings."""
        serializer = NavigationUpdateSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        current_rssi = data['current_rssi']
        previous_rssi = data.get('previous_rssi')
        
        distance = calculate_distance_from_rssi(current_rssi)
        quality_level, quality_desc = get_signal_quality(current_rssi)
        guidance = get_navigation_guidance(current_rssi, previous_rssi)
        
        return Response({
            'beacon_id': str(data['beacon_id']),
            'estimated_distance': distance,
            'formatted_distance': format_distance(distance),
            'signal_quality': {
                'level': quality_level,
                'description': quality_desc
            },
            'navigation': guidance,
            'rssi': current_rssi
        })


class DistanceCalculatorAPIView(APIView):
    """API endpoint for RSSI to distance calculation."""
    
    def post(self, request):
        """Calculate distance from RSSI value."""
        serializer = RSSIDistanceSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        distance = calculate_distance_from_rssi(
            rssi=data['rssi'],
            tx_power=data['tx_power'],
            environment_factor=data['environment_factor']
        )
        
        quality_level, quality_desc = get_signal_quality(data['rssi'])
        
        return Response({
            'rssi': data['rssi'],
            'tx_power': data['tx_power'],
            'environment_factor': data['environment_factor'],
            'estimated_distance_meters': distance,
            'formatted_distance': format_distance(distance),
            'signal_quality': {
                'level': quality_level,
                'description': quality_desc
            }
        })


@api_view(['GET'])
def api_status(request):
    """API status and statistics endpoint."""
    active_beacons = SOSBeacon.objects.filter(status='active').count()
    active_sessions = RescueSession.objects.filter(status='active').count()
    total_rescues = RescueSession.objects.filter(status='completed').count()
    active_events = EmergencyEvent.objects.filter(status='active').count()
    
    return Response({
        'status': 'operational',
        'version': '1.0.0',
        'statistics': {
            'active_beacons': active_beacons,
            'active_rescue_sessions': active_sessions,
            'total_completed_rescues': total_rescues,
            'active_emergency_events': active_events
        },
        'timestamp': timezone.now().isoformat()
    })
