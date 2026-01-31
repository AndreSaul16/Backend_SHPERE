"""
Sistema de Logging Estructurado para SPHERE Backend.
Proporciona logs con colores, timestamps y contexto automático.
"""
import logging
import sys
from datetime import datetime
from typing import Optional

# Intentar importar colorama para Windows
try:
    from colorama import init, Fore, Style
    init(autoreset=True)
    COLORS_AVAILABLE = True
except ImportError:
    COLORS_AVAILABLE = False
    # Fallbacks vacíos
    class Fore:
        RED = GREEN = YELLOW = CYAN = MAGENTA = WHITE = RESET = ""
    class Style:
        BRIGHT = RESET_ALL = ""


class ColoredFormatter(logging.Formatter):
    """Formatter con colores para diferentes niveles de log."""
    
    LEVEL_COLORS = {
        logging.DEBUG: Fore.CYAN,
        logging.INFO: Fore.GREEN,
        logging.WARNING: Fore.YELLOW,
        logging.ERROR: Fore.RED,
        logging.CRITICAL: Fore.MAGENTA + Style.BRIGHT,
    }
    
    LEVEL_ICONS = {
        logging.DEBUG: "🔍",
        logging.INFO: "✅",
        logging.WARNING: "⚠️",
        logging.ERROR: "❌",
        logging.CRITICAL: "🔥",
    }

    def format(self, record: logging.LogRecord) -> str:
        # Timestamp ISO8601
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        
        # Color y icono según nivel
        color = self.LEVEL_COLORS.get(record.levelno, "")
        icon = self.LEVEL_ICONS.get(record.levelno, "")
        reset = Style.RESET_ALL if COLORS_AVAILABLE else ""
        
        # Formato: [TIMESTAMP] ICON LEVEL | MODULE:LINENO | MESSAGE
        level_name = record.levelname.ljust(8)
        module_info = f"{record.module}:{record.lineno}"
        
        formatted = f"[{timestamp}] {icon} {color}{level_name}{reset} | {module_info.ljust(25)} | {record.getMessage()}"
        
        # Añadir exception info si existe
        if record.exc_info:
            formatted += f"\n{self.formatException(record.exc_info)}"
            
        return formatted


def get_logger(name: str, level: int = logging.DEBUG) -> logging.Logger:
    """
    Obtiene un logger configurado con formato coloreado.
    
    Args:
        name: Nombre del módulo (usar __name__)
        level: Nivel mínimo de logging (default: DEBUG)
    
    Returns:
        Logger configurado
    """
    logger = logging.getLogger(name)
    
    # Evitar duplicados si ya está configurado
    if logger.handlers:
        return logger
    
    logger.setLevel(level)
    
    # Handler para consola con colores
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(ColoredFormatter())
    
    logger.addHandler(console_handler)
    
    # Evitar propagación al root logger
    logger.propagate = False
    
    return logger


# Logger global para el módulo de database
db_logger = get_logger("sphere.database")
api_logger = get_logger("sphere.api")
stream_logger = get_logger("sphere.stream")
checkpoint_logger = get_logger("sphere.checkpoint")
