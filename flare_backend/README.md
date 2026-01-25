# FLARE Backend API

Django REST API backend for the FLARE Emergency Rescue Beacon system.

## Quick Start

### Prerequisites

- Python 3.10+
- pip
- PostgreSQL (or SQLite for development)

### Installation

1. **Create virtual environment:**
```bash
cd flare_backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Configure environment:**
```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
# For local development, SQLite will be used by default
```

4. **Run migrations:**
```bash
python manage.py migrate
```

5. **Create superuser (optional):**
```bash
python manage.py createsuperuser
```

6. **Start development server:**
```bash
python manage.py runserver
```

The API will be available at `http://localhost:8000/api/`

## API Endpoints

### Health Check
- `GET /health/` - Server health status

### Status
- `GET /api/status/` - API statistics and status

### Users
- `GET /api/users/` - List users
- `POST /api/users/` - Create user
- `GET /api/users/{id}/` - Get user details
- `GET /api/users/by_device/?device_id=xxx` - Get user by device ID
- `GET /api/users/rescuers/` - List verified rescuers

### Private Groups
- `GET /api/groups/` - List groups
- `POST /api/groups/` - Create group
- `POST /api/groups/join/` - Join group with code
- `POST /api/groups/{id}/leave/` - Leave group

### SOS Beacons
- `GET /api/beacons/` - List beacons (with filters)
- `POST /api/beacons/` - Create beacon
- `GET /api/beacons/active/` - Get active beacons
- `POST /api/beacons/{id}/update_status/` - Update beacon status
- `POST /api/beacons/{id}/update_battery/` - Update battery level
- `POST /api/beacons/{id}/update_location/` - Update location

### Beacon Detections
- `GET /api/detections/` - List detections
- `POST /api/detections/` - Record detection
- `POST /api/detections/batch_create/` - Batch create detections

### Rescue Sessions
- `GET /api/sessions/` - List sessions
- `POST /api/sessions/` - Create session
- `POST /api/sessions/{id}/complete/` - Complete rescue
- `POST /api/sessions/{id}/abandon/` - Abandon rescue

### Heat Map Data
- `GET /api/heatmap/` - List heat map data
- `GET /api/heatmap/grid/?session_id=xxx` - Get 2D grid
- `POST /api/heatmap/batch_update/` - Batch update cells

### Emergency Events
- `GET /api/events/` - List events
- `POST /api/events/` - Create event
- `POST /api/events/{id}/add_beacon/` - Add beacon to event
- `POST /api/events/{id}/resolve/` - Resolve event

### Navigation
- `POST /api/navigate/` - Get navigation guidance
- `POST /api/calculate-distance/` - Calculate distance from RSSI

## Supabase Integration

To use Supabase PostgreSQL:

1. Create a Supabase project at https://supabase.com
2. Get your database connection string
3. Update `.env`:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=your-anon-key
```

## Development

### Running Tests
```bash
python manage.py test
```

### Admin Interface
Access Django admin at `http://localhost:8000/admin/`

## Production Deployment

1. Set `DEBUG=False` in `.env`
2. Configure `ALLOWED_HOSTS`
3. Use gunicorn:
```bash
gunicorn flare_backend.wsgi:application --bind 0.0.0.0:8000
```
