from alembic import context
from sqlalchemy import create_engine

from gizer.config import get_settings
from gizer.db import Base

target_metadata = Base.metadata


def run():
    engine = create_engine(get_settings().database_url)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run()
