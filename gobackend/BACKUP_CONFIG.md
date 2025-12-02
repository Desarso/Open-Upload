# Coolify Backup Configuration for MinIO

## What Gets Backed Up

Coolify backups typically include:
- **Application volumes** (database files, persistent data)
- **Environment variables** (configuration)
- **Docker Compose configuration**
- **Application code/images** (if configured)

For this application, backups will include:
1. **SQLite Database** (`/app/db/database.db`) - Contains:
   - Users, Projects, API Keys, API Usage, File metadata
2. **MinIO Data** (`/data` volume in MinIO container, mounted from `${MINIO_HOST_PATH}`) - Contains:
   - All uploaded media files (stored in buckets like `openupload`)
   - MinIO's internal bucket structure and metadata
   - **Note**: All media is stored in MinIO's `/data` volume, which MinIO manages internally
3. **Firebase Credentials** (`/app/firebase/`) - Contains:
   - Firebase service account credentials

## Setting Up Coolify Backups to MinIO

### Step 1: Create a Backup Bucket in MinIO

1. Access MinIO Console (usually at `http://your-domain:9001` or via Traefik)
2. Create a new bucket called `coolify-backups` (or your preferred name)
3. Note the bucket name for Step 2

### Step 2: Configure S3 Storage in Coolify

1. Go to Coolify Dashboard → **Settings** → **Storages**
2. Click **Add Storage** → Select **S3**
3. Fill in the following:
   - **Name**: `MinIO Backups` (or your preferred name)
   - **Endpoint**: `http://minio:9000` (internal) or your public MinIO endpoint
   - **Bucket**: `coolify-backups` (the bucket you created)
   - **Region**: `us-east-1` (or your MINIO_REGION)
   - **Access Key**: Your `MINIO_ROOT_USER`
   - **Secret Key**: Your `MINIO_ROOT_PASSWORD`
   - **Use Path Style**: `true` (required for MinIO)

### Step 3: Configure Backup Settings

1. Go to Coolify Dashboard → **Settings** → **Backup**
2. Enable backups
3. Select the MinIO storage you just created
4. Configure:
   - **Backup Schedule**: Daily, Weekly, etc.
   - **Retention Policy**: How many backups to keep (e.g., 30 days, 7 backups)
   - **Backup Volumes**: Ensure volumes are included

### Step 4: Verify Backup Configuration

The backup will include:
- Volume: `${DB_HOST_PATH}` → `/app/db` (SQLite database)
- Volume: `${MINIO_HOST_PATH}` → `/data` (MinIO files)
- Volume: `${FIREBASE_HOST_PATH}` → `/app/firebase` (Firebase credentials)

## Important Notes

1. **Separate Bucket**: Use a separate bucket for backups (not your main `openupload` bucket) to avoid conflicts
2. **Internal vs External**: For Coolify running on the same network, use `http://minio:9000` (internal). For external access, use your public MinIO endpoint
3. **Path Style**: MinIO requires path-style addressing (`Use Path Style: true`)
4. **Backup Frequency**: Consider daily backups for production, weekly for development
5. **Retention**: Set appropriate retention based on your needs (30-90 days is common)

## Manual Backup Commands

If you need to manually backup:

```bash
# Backup SQLite database
docker exec openupload-go-backend sqlite3 /app/db/database.db ".backup /tmp/backup.db"
docker cp openupload-go-backend:/tmp/backup.db ./backup-$(date +%Y%m%d).db

# Backup MinIO data (using mc client)
mc mirror /mnt/media s3/coolify-backups/minio-data/$(date +%Y%m%d)/
```

## Restore Process

To restore from Coolify backup:
1. Go to Coolify Dashboard → **Backups**
2. Select the backup you want to restore
3. Click **Restore**
4. Select which volumes/data to restore
5. Restart the application

