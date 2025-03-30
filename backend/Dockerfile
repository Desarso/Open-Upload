FROM ghcr.io/astral-sh/uv:debian-slim

# Set working directory
WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN uv pip install -r requirements.txt

# Copy the rest of the application
COPY . .

EXPOSE 8000

# Run the application
CMD ["uv", "run", "main.py"]
