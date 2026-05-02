pushd /home/ec2-user/time2leave/backend
<<<<<<< HEAD
docker build -t time2leave-api:latest .
# Stop the legacy `api-traffic` compose project once on first run after
# rename, then start under the new name. Safe to leave in: the
# pre-rename project simply won't exist on subsequent runs.
docker compose -p api-traffic down 2>/dev/null || true
docker compose -p time2leave-api down
docker compose -p time2leave-api up -d
=======
docker build -t api-traffic:latest .
docker compose -p api-traffic down
docker compose -p api-traffic up -d
>>>>>>> 21e600ea829e7248135de0d43a80d638bd3d5ead
docker image prune -a -f
popd
