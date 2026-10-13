from pathlib import Path

import psycopg
from psycopg.rows import dict_row

SCHEMA = Path(__file__).with_name("schema.sql")


def create_schema(pool):
    """Create the tables and indexes that do not exist yet."""
    with pool.connection() as conn:
        conn.execute(SCHEMA.read_text())


class BasePostgresService:
    # Set by subclasses. Only these constants are formatted into SQL; values
    # always go in as query parameters.
    table_name = None
    parent_column = None  # the column get_paginated_items filters on
    columns = None  # SELECT list returning the keys the API uses

    def __init__(self, pool):
        self.pool = pool

    def query(self, sql, params):
        """
        Run a query and return its rows as dicts.
        :param sql: Query with %s or %(name)s placeholders.
        :param params: Values for the placeholders.
        :return: The rows, or None when Postgres rejects the values (malformed id, unknown record).
        """
        try:
            with self.pool.connection() as conn:
                return conn.cursor(row_factory=dict_row).execute(sql, params).fetchall()
        except (psycopg.DataError, psycopg.IntegrityError) as e:
            print(f"Unable to query {self.table_name}: {e}")
            return None

    def query_one(self, sql, params):
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def get_item_by_id(self, uuid):
        """
        Retrieve an item by its id.
        :param uuid: Value of the id.
        :return: Retrieved item or None if not found.
        """
        return self.query_one(
            f"SELECT {self.columns} FROM {self.table_name} WHERE id = %s", (uuid,)
        )

    def get_paginated_items(self, parent_id, limit, cursor=None, columns=None):
        """
        Retrieve a page of the items that belong to parent_id, newest first.
        :param cursor: The "next" value of the previous page.
        :param columns: SELECT list to use instead of self.columns.
        :return: {"data": items, "next": cursor of the following page or None}
        """
        limit = max(limit, 1)
        # ORDER BY names the table: bare names would sort by the SELECT list's
        # created_at and id, which are rendered as JSON and text
        rows = self.query(
            f"""
            SELECT {columns or self.columns} FROM {self.table_name}
            WHERE {self.parent_column} = %(parent)s
              AND (%(cursor)s::uuid IS NULL OR (created_at, id) <
                   (SELECT created_at, id FROM {self.table_name} WHERE id = %(cursor)s::uuid))
            ORDER BY {self.table_name}.created_at DESC, {self.table_name}.id DESC
            LIMIT %(limit)s
            """,
            {"parent": parent_id, "cursor": cursor, "limit": limit + 1},
        ) or []
        return {
            "data": rows[:limit],
            "next": rows[limit - 1]["id"] if len(rows) > limit else None,
        }
