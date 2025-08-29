FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy app and static/templates
COPY app.py ./ 
COPY templates ./templates
COPY static ./static

# Create mount points (images + settings volume)
VOLUME ["/app/wallpapers", "/app/data"]

EXPOSE 8000
CMD ["gunicorn", "app:app", "-b", "0.0.0.0:8000", "--workers", "2"]
