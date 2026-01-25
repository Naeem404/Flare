"""
URL configuration for flare_backend project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def health_check(request):
    """Health check endpoint for monitoring."""
    return JsonResponse({
        'status': 'healthy',
        'service': 'FLARE Backend API',
        'version': '1.0.0'
    })


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('health/', health_check, name='health_check'),
]
