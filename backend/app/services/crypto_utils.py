import os
from typing import Optional
from cryptography.fernet import Fernet


_DEFAULT_KEY = b"fP-wV91j15L7Oa2P_T4lWnZ0u_5lP0nQkI9pBfMv-3E="


def _get_key() -> bytes:
    """
    Returns a symmetric key for demo encryption.

    For real deployments, replace this with a secure secret management solution.
    """
    env_key = os.getenv("PUPPY_AGENT_SECRET_KEY")
    if env_key:
        try:
            # Validate it's a valid Fernet key
            Fernet(env_key)
            return env_key.encode("utf-8") if isinstance(env_key, str) else env_key
        except Exception:
            pass
    # Fallback static key for demo
    return _DEFAULT_KEY


def encrypt_text(plain: Optional[str]) -> Optional[str]:
    if plain is None:
        return None
    f = Fernet(_get_key())
    return f.encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_text(cipher: Optional[str]) -> Optional[str]:
    if cipher is None:
        return None
    f = Fernet(_get_key())
    return f.decrypt(cipher.encode("utf-8")).decode("utf-8")
