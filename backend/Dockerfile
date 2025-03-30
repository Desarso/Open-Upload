FROM ghcr.io/astral-sh/uv:debian-slim


# RUN apt-get install -y  curl
# Set working directory
WORKDIR /app

# Copy requirements file
COPY . .

EXPOSE 8000


# Run the application
CMD ["uv", "run", "index.py"]%                                                                                                                                                                                                                                        
