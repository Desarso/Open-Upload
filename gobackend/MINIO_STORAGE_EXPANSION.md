# MinIO Storage Expansion Guide

## How MinIO Handles Multiple Volumes

MinIO automatically becomes aware of volumes when you:
1. **Mount them** in the `volumes` section
2. **Pass them** to the `server` command

MinIO will automatically use all volumes you provide. No additional configuration needed!

## Current Setup (Single Volume)

```yaml
minio:
  command: server /data --console-address ":9001"
  volumes:
    - ${MINIO_HOST_PATH}:/data
```

## Adding More Storage

### Option 1: Add Additional Volumes (Recommended)

**Step 1:** Add environment variables for new volumes in Coolify:
- `MINIO_HOST_PATH_2` (e.g., `/mnt/media2`)
- `MINIO_HOST_PATH_3` (e.g., `/mnt/media3`)
- `MINIO_HOST_PATH_4` (e.g., `/mnt/media4`)

**Step 2:** Update `docker-compose.yaml`:

```yaml
minio:
  command: server /data /data2 /data3 /data4 --console-address ":9001"
  volumes:
    - ${MINIO_HOST_PATH}:/data
    - ${MINIO_HOST_PATH_2}:/data2
    - ${MINIO_HOST_PATH_3}:/data3
    - ${MINIO_HOST_PATH_4}:/data4
```

**Step 3:** Restart MinIO:
```bash
docker compose restart minio
```

MinIO will automatically:
- Recognize all volumes
- Use them for storage
- Distribute data across them

### Option 2: Expand Existing Volume

If your host path (`${MINIO_HOST_PATH}`) is on a filesystem that supports expansion (like LVM, ZFS, or cloud volumes), you can:
1. Expand the underlying storage
2. Resize the filesystem
3. MinIO will automatically use the additional space (no restart needed!)

## Erasure Coding (Data Redundancy)

**Important:** With 4+ volumes, MinIO automatically enables **erasure coding**:
- **4 volumes**: 2:2 erasure coding (50% redundancy)
- **6 volumes**: 3:3 erasure coding (50% redundancy)
- **8 volumes**: 4:4 erasure coding (50% redundancy)

This means:
- Your data is protected against disk failures
- You can lose up to half your disks without data loss
- Storage capacity = total capacity × 50% (due to redundancy)

**Example:**
- 4 volumes × 1TB each = 4TB total
- With erasure coding = 2TB usable storage
- Can lose 2 disks without data loss

## Single Volume vs Multiple Volumes

### Single Volume (`/data` only)
- ✅ Simple setup
- ✅ Full capacity available
- ❌ No redundancy (single point of failure)
- ❌ No erasure coding

### Multiple Volumes (4+)
- ✅ Erasure coding enabled automatically
- ✅ Data redundancy and fault tolerance
- ✅ Can survive disk failures
- ❌ Only 50% capacity usable (due to redundancy)

## Important Notes

1. **Volume Count:** Must be even number (2, 4, 6, 8, etc.) for erasure coding
2. **Volume Size:** Ideally, all volumes should be the same size for optimal performance
3. **Adding Volumes:** You can add volumes later, but MinIO won't automatically rebalance existing data
4. **Removing Volumes:** Not recommended - can cause data loss if erasure coding is enabled
5. **Backup First:** Always backup before making storage changes

## Migration Strategy

If you want to add volumes to an existing single-volume setup:

1. **Backup your data** (use Coolify backups or manual backup)
2. **Add new volumes** to docker-compose.yaml
3. **Update the command** to include all volumes
4. **Restart MinIO** - it will recognize new volumes
5. **New uploads** will be distributed across all volumes
6. **Existing data** stays on `/data` (not automatically rebalanced)

To rebalance existing data, you'd need to:
- Copy data from old volume to new volumes manually, OR
- Set up a new MinIO instance with all volumes and migrate data

## Example: Adding 3 More Volumes

**Before:**
```yaml
command: server /data --console-address ":9001"
volumes:
  - ${MINIO_HOST_PATH}:/data
```

**After:**
```yaml
command: server /data /data2 /data3 /data4 --console-address ":9001"
volumes:
  - ${MINIO_HOST_PATH}:/data
  - ${MINIO_HOST_PATH_2}:/data2
  - ${MINIO_HOST_PATH_3}:/data3
  - ${MINIO_HOST_PATH_4}:/data4
```

**In Coolify, add these environment variables:**
- `MINIO_HOST_PATH_2=/mnt/media2`
- `MINIO_HOST_PATH_3=/mnt/media3`
- `MINIO_HOST_PATH_4=/mnt/media4`

Then restart the MinIO service. MinIO will automatically use all 4 volumes with erasure coding!

