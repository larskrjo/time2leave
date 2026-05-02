pushd /home/ec2-user/time2leave/backend
docker build -t time2leave-api:latest .
docker compose -p time2leave-api down
docker compose -p time2leave-api up -d
docker image prune -a -f
popd
