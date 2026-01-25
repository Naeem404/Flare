"""
FLARE API URL Configuration
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'users', views.FlareUserViewSet, basename='user')
router.register(r'groups', views.PrivateGroupViewSet, basename='group')
router.register(r'beacons', views.SOSBeaconViewSet, basename='beacon')
router.register(r'detections', views.BeaconDetectionViewSet, basename='detection')
router.register(r'sessions', views.RescueSessionViewSet, basename='session')
router.register(r'heatmap', views.HeatMapDataViewSet, basename='heatmap')
router.register(r'events', views.EmergencyEventViewSet, basename='event')

urlpatterns = [
    path('', include(router.urls)),
    path('status/', views.api_status, name='api_status'),
    path('navigate/', views.NavigationAPIView.as_view(), name='navigation'),
    path('calculate-distance/', views.DistanceCalculatorAPIView.as_view(), name='calculate_distance'),
]
