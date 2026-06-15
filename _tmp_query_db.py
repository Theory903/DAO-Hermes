import sqlite3, json, os

# Query main state.db
db_path = os.path.expanduser("~/.hermes/state.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print("=== main state.db tables ===")
for t in tables:
    print(f"  {t}")
    cur.execute(f"SELECT * FROM \"{t}\" LIMIT 3")
    rows = cur.fetchall()
    if rows:
        colnames = [d[0] for d in cur.description]
        print(f"    cols: {colnames}")
        for r in rows:
            print(f"    {r}")
conn.close()

# Query space state.db
space_db = "/Users/abhishekjha/CODE/Nexus cortex/hermes-agent/data/spaces/0c16b791-f481-45fb-8935-93877447faf5/state.db"
if os.path.exists(space_db):
    conn2 = sqlite3.connect(space_db)
    cur2 = conn2.cursor()
    cur2.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables2 = [r[0] for r in cur2.fetchall()]
    print("\n=== space state.db tables ===")
    for t in tables2:
        print(f"  {t}")
        cur2.execute(f"SELECT * FROM \"{t}\" LIMIT 3")
        rows = cur2.fetchall()
        if rows:
            colnames = [d[0] for d in cur2.description]
            print(f"    cols: {colnames}")
            for r in rows:
                print(f"    {r}")
    conn2.close()
else:
    print("\n=== space state.db NOT FOUND ===")
