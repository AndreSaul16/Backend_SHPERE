# Usamos una imagen ligera oficial de Python
FROM python:3.11-slim

# Establecemos el directorio de trabajo
WORKDIR /app

# Instalamos dependencias del sistema necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copiamos solo el archivo de dependencias (para aprovechar la cache)
COPY requirements.txt .

# Instalamos dependencias de Python
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiamos el resto del código
COPY . .

# Exponemos el puerto que usará FastAPI
EXPOSE 8000

# Comando por defecto al iniciar el contenedor
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
