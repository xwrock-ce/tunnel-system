"""Database session management."""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import hashlib
import secrets

from app.config import settings
from app.models.database import Base, User

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True
)

# Create async session factory
async_session = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Simple password hashing (SHA256 + salt for demo, use bcrypt/argon2 in production)
def hash_password(password: str) -> str:
    """Hash a password with salt."""
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${pwd_hash}"


def verify_password_hash(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    if '$' not in hashed:
        return False
    salt, pwd_hash = hashed.split('$', 1)
    return hashlib.sha256((salt + password).encode()).hexdigest() == pwd_hash


async def get_db() -> AsyncSession:
    """Get database session dependency."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database and create default admin user."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if settings.DATABASE_URL.startswith("sqlite"):
            cols = await conn.execute(text("PRAGMA table_info(analyses)"))
            existing = {row._mapping["name"] for row in cols.fetchall()}
            migrations = {
                "scale_mm_per_pixel": "FLOAT",
                "crack_mask_image": "VARCHAR(255)",
                "crack_overlay_image": "VARCHAR(255)",
                "combined_overlay_image": "VARCHAR(255)",
                "crack_count": "INTEGER",
                "crack_pixel_count": "INTEGER",
                "crack_confidence": "FLOAT",
            }
            for col, ddl in migrations.items():
                if col not in existing:
                    await conn.execute(text(f"ALTER TABLE analyses ADD COLUMN {col} {ddl}"))

    # Create default admin user if not exists
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(User).where(User.username == settings.ADMIN_USERNAME)
        )
        admin = result.scalar_one_or_none()

        if not admin:
            admin = User(
                username=settings.ADMIN_USERNAME,
                password_hash=hash_password(settings.ADMIN_PASSWORD)
            )
            session.add(admin)
            await session.commit()
            print(f"Created default admin user: {settings.ADMIN_USERNAME}")
