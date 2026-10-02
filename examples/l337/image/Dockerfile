FROM nginxinc/nginx-unprivileged:1.26.1
USER root
ENV SERVICE=web
COPY marker /marker
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN mkdir -p /data && chmod 777 /data
