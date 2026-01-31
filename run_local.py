#!/usr/bin/env python
"""
Script para ejecutar el backend SPHERE localmente (fuera de contenedores).
Muestra logs en tiempo real con colores en la terminal.

Uso:
    python run_local.py
    python run_local.py --port 8001
    python run_local.py --log-level debug
"""
import os
import sys
import argparse
import logging
from pathlib import Path

# Añadir el directorio actual al path para imports
sys.path.insert(0, str(Path(__file__).parent))

# Cargar variables de entorno ANTES de importar otros módulos
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)
print(f"📁 Cargando .env desde: {env_path}")

# Verificar variables críticas
MONGODB_URL = os.getenv("MONGODB_URL")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

if not MONGODB_URL:
    print("❌ ERROR: MONGODB_URL no está definida en .env")
    sys.exit(1)

if not DEEPSEEK_API_KEY:
    print("⚠️  WARNING: DEEPSEEK_API_KEY no está definida (LLM no funcionará)")


def configure_logging(level: str):
    """Configura logging a nivel de aplicación."""
    log_level = getattr(logging, level.upper(), logging.DEBUG)
    
    # Formato con colores para uvicorn
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    # Reducir ruido de librerías externas
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def main():
    parser = argparse.ArgumentParser(
        description="Ejecutar SPHERE Backend localmente",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python run_local.py                    # Puerto 8000, log level INFO
  python run_local.py --port 8001        # Puerto 8001
  python run_local.py --log-level debug  # Logs detallados
  python run_local.py --reload           # Auto-reload en cambios
        """
    )
    
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=8000,
        help="Puerto HTTP (default: 8000)"
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host a escuchar (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--log-level", "-l",
        choices=["debug", "info", "warning", "error"],
        default="info",
        help="Nivel de logging (default: info)"
    )
    parser.add_argument(
        "--reload", "-r",
        action="store_true",
        help="Auto-reload cuando cambian archivos (desarrollo)"
    )
    
    args = parser.parse_args()
    
    # Configurar logging
    configure_logging(args.log_level)
    
    print("\n" + "="*60)
    print("🚀 SPHERE Backend - Modo Local")
    print("="*60)
    print(f"   Host:      {args.host}")
    print(f"   Puerto:    {args.port}")
    print(f"   Log Level: {args.log_level.upper()}")
    print(f"   Reload:    {'Sí' if args.reload else 'No'}")
    print(f"   MongoDB:   {MONGODB_URL[:30]}...")
    print("="*60 + "\n")
    
    # Importar después de configurar logging
    import uvicorn
    
    # Conectar a MongoDB antes de iniciar
    try:
        from app.core.database import db
        print("📡 Conectando a MongoDB...")
        db.connect()
        print("✅ Conexión establecida\n")
    except Exception as e:
        print(f"❌ Error conectando a MongoDB: {e}")
        sys.exit(1)
    
    # Iniciar servidor
    try:
        uvicorn.run(
            "main:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            log_level=args.log_level,
            access_log=True
        )
    except KeyboardInterrupt:
        print("\n\n👋 Servidor detenido por el usuario")
    finally:
        from app.core.database import db
        db.close()


if __name__ == "__main__":
    main()
