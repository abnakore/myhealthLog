FROM nginx:latest

# Ship the config inside the image so it is self-contained. In dev, compose also
# bind-mounts these same paths read-only (see docker-compose.yml) so you can edit
# them without rebuilding — the mount simply shadows what's baked in here.
RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY include.websocket /etc/nginx/app/include.websocket
COPY include.forwarded /etc/nginx/app/include.forwarded

EXPOSE 8080
