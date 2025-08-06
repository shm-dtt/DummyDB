import os
import json
from supabase import create_client, Client
from supabase.client import ClientOptions

def insert_schema():
    url = os.environ.get("SUPABASE_URL")
    if url is None:
        raise ValueError("SUPABASE_URL environment variable is not set")
    key = os.environ.get("SUPABASE_KEY")
    if key is None:
        raise ValueError("SUPABASE_KEY environment variable is not set")

    supabase: Client = create_client(
        url,
        key,
        options=ClientOptions(
            postgrest_client_timeout=10,
            storage_client_timeout=10,
            schema="public",
        )
    )

    # Path to api/schemas folder (relative to this script)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    SCHEMA_DIR = os.path.abspath(os.path.join(current_dir, "..", "..", "schemas"))

    # Loop through all JSON files in schemas folder
    for file_name in os.listdir(SCHEMA_DIR):
        if file_name.endswith(".json"):
            file_path = os.path.join(SCHEMA_DIR, file_name)
            print(f"Loading {file_path}...")

            # Load JSON content
            with open(file_path, "r", encoding="utf-8") as f:
                json_data = json.load(f)

            # Insert into schema_parse table
            response = supabase.table("schema_parse").insert({
                "schema": json_data
            }).execute()

            print(f"Inserted {file_name}: {response}")
